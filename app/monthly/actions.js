"use server";

import { revalidatePath } from "next/cache";
import { fetchAll } from "@/lib/fetchAll";
import { createClient } from "@/lib/supabase/server";
import { loadSettings, loadMessageParts } from "@/lib/settings";
import { summarize, buildMonthlyText, monthLabel, offScheduleAbsences } from "@/lib/monthly";
import { isClosed, GATE_COLS, GATE_COLS_OLD } from "@/lib/closeGate";
import { IN_APP_DETAIL } from "@/lib/notify";
import { pushToFamilies } from "@/app/push/actions";
import { endOfMonth, todaySeoul } from "@/lib/day";
import { extraDatesBy } from "@/lib/extraTerm";
import { isStudentUnit, toExamShape } from "@/lib/unitScore";
import { takesExam } from "@/lib/who";
import { needSql } from "@/lib/sqlError";
import { sessionUser } from "@/lib/session";

/** "2026-07" → "2026-06" */
function prevYm(ym) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const NEED = "0031 SQL 을 먼저 실행해주세요.";

/**
 * 한 달치를 학생별로 모은다.
 * 새로 입력받는 것은 없다 — 그 달 데일리리포트를 다시 세는 것뿐이다.
 */
export async function loadMonth(ym) {
  const supabase = await createClient();
  const from = `${ym}-01`;
  const to = endOfMonth(ym);
  /**
   * **이번 달은 오늘까지만** — 아래 특강 셈이 쓰던 잣대를 판에도 똑같이 댄다.
   *
   * 0184 로 결석 예정·시험 결석·할일 결석·학부모 요청이 **앞날 판**까지
   * 만들게 됐다. 그대로면 아직 오지도 않은 날이 「총 N회 수업」 에 미리
   * 들어간다 (다음 주 가족여행 결석이 오늘 벌써 한 회로 잡히는 식).
   * 학생(/me)·학부모(/parent) 화면은 원래 오늘까지만 읽는다 — 여기만
   * 달 끝까지 읽고 있었다. 셋이 같은 숫자여야 한다.
   */
  const capTo = to < todaySeoul() ? to : todaySeoul();

  const settings = await loadSettings(supabase);
  const parts = await loadMessageParts(supabase, settings.message);
  const msg = parts.monthly || settings.message;

  let { data: students, error: stuErr } = await supabase
    .from("students")
    .select("id, name, school, grade, parent_phone, status, score_share")
    .order("name", { ascending: true });
  if (stuErr) {
    // 0101 전이면 공개 설정 없이 — 전원 공개로 본다
    ({ data: students } = await supabase
      .from("students")
      .select("id, name, school, grade, parent_phone, status")
      .order("name", { ascending: true }));
  }
  const enrolled = (students || []).filter((s) => !s.status || s.status === "enrolled");

  // 지난달까지 같이 읽는다 — 한 줄 평은 **변화**를 말할 때 제일 와닿는다
  const pym = prevYm(ym);
  // 단원평가(0099 — sent_unit)도 여기서 같이 읽는다: **daily_reports 가 원본**이다
  // 두 달 × 전 재원생이라 1000줄을 막 넘는 크기다 — 잘리면 월말 학생들
  // 리포트가 조용히 빈다 (A5)
  /**
   * 마감 판정 칸(lib/closeGate GATE_COLS)을 꼭 같이 읽는다.
   *
   * **이 화면은 원장 눈(is_staff)이라 RLS 가 아무것도 안 막는다.** 그래서
   * 마감 안 한 판까지 그대로 세어, 학부모 화면(마감된 것만)과 같은 달의
   * 숫자가 어긋났다. 여기서 칸을 읽어주면 summarize 가 게이트를 탄다.
   */
  const MONTH_COLS =
    "id, student_id, date, attendance_kind, word_correct, word_total, sent_unit, sent_correct, sent_total, sent_passed";
  const monthQ = (cols) => fetchAll(() =>
    supabase
      .from("daily_reports")
      .select(cols)
      .is("archived_at", null)
      .gte("date", `${pym}-01`)
      .lte("date", to)
      .order("id"));
  let { data: all, error: allErr } = await monthQ(`${MONTH_COLS}, ${GATE_COLS}`);
  if (allErr) {
    // 0169 전이면 closed_at 이 없다 — report_written 만으로도 게이트는 산다
    ({ data: all, error: allErr } = await monthQ(`${MONTH_COLS}, ${GATE_COLS_OLD}`));
  }
  if (allErr) {
    // 0099 전이면 단원평가 칸 없이
    ({ data: all } = await monthQ(
      `id, student_id, date, attendance_kind, word_correct, word_total, ${GATE_COLS_OLD}`
    ));
  }
  const reports = (all || []).filter((r) => r.date >= from && r.date <= capTo);
  const prevReports = (all || []).filter((r) => r.date < from);

  const ids = (all || []).map((r) => r.id);
  const { data: items } = ids.length
    ? await fetchAll(() =>
        supabase
          .from("daily_report_items")
          .select("daily_report_id, status")
          .in("daily_report_id", ids)
          .in("status", ["done", "weak", "missing"])
          .order("daily_report_id")
      )
    : { data: [] };
  const itemsOf = new Map();
  (items || []).forEach((x) => {
    if (!itemsOf.has(x.daily_report_id)) itemsOf.set(x.daily_report_id, []);
    itemsOf.get(x.daily_report_id).push({ status: x.status });
  });

  // 단원평가 — **두 군데에서 모은다** (2026-08-11, 오늘 수업의 이중 입력을 없앰).
  //   1) daily_reports 의 단원평가 칸 (0099) — 이제 여기가 적는 자리다
  //   2) unit_exams — 예전 「단원평가 상자」 로 적어온 것 (0031). 지난 기록이
  //      여기 있으니 계속 읽는다. 같은 날 같은 이름이 둘 다 있으면 하나로 센다.
  const eq = await supabase
    .from("unit_exams")
    .select("student_id, date, name, score, total")
    .gte("date", from)
    .lte("date", to);
  const examsOf = new Map();
  const seenExam = new Set();
  const putExam = (e) => {
    const k = `${e.student_id}|${e.date}|${e.name}`;
    if (seenExam.has(k)) return;
    seenExam.add(k);
    if (!examsOf.has(e.student_id)) examsOf.set(e.student_id, []);
    examsOf.get(e.student_id).push(e);
  };
  reports
    // 마감 안 한 판의 단원평가는 문구에 안 넣는다 (원장 확정 8/28) —
    // summarize 의 점수·검사와 같은 잣대여야 한 글 안에서 안 어긋난다
    .filter((r) => isClosed(r) && (r.sent_unit || "").trim())
    .forEach((r) => putExam({
      student_id: r.student_id,
      date: r.date,
      name: r.sent_passed === false ? `${r.sent_unit.trim()} (재시험)` : r.sent_unit.trim(),
      score: r.sent_correct ?? null,
      total: r.sent_total ?? null,
    }));
  (eq.error ? [] : eq.data || []).forEach((e) => putExam(e));

  /**
   *   3) **아이가 학생 화면에서 직접 낸 것** (0106 — 감사 ⑥-3).
   *      아이는 판을 못 쓰니 scores 에만 들어간다(source='form'). 여기를
   *      안 보면 아이가 낸 단원평가가 월간리포트 문구에 영영 안 실렸다 —
   *      「이번 달 단원평가를 한 번도 안 봤다」 로 읽힌다.
   *      판에도 같은 것이 적혀 있으면 위에서 이미 담겨 하나로 센다
   *      (이름을 판과 같은 규칙으로 맞춘다 — lib/unitScore).
   *      source 칸이 없는 옛 DB 면 조회가 error → 조용히 예전 그대로.
   */
  const sq = await supabase
    .from("scores")
    .select("student_id, taken_on, kind, term, raw_score, full_score, note, source")
    .eq("kind", "unit")
    .gte("taken_on", from)
    .lte("taken_on", to);
  // 마감한 날만 — 판 쪽과 **같은 잣대**여야 한 글 안에서 안 어긋난다
  // (원장 확정 8/28). 아이가 낸 것도 그날 판이 마감되어야 문구에 실린다
  const closedDay = new Set(
    reports.filter((r) => isClosed(r)).map((r) => `${r.student_id}|${r.date}`)
  );
  (sq.error ? [] : sq.data || [])
    .filter(isStudentUnit)
    .filter((s) => closedDay.has(`${s.student_id}|${s.taken_on}`))
    .forEach((s) => putExam(toExamShape(s)));

  // 특강(0164) 수업일 — 「총 N회 수업」 에 들어간다 (정규와 겹친 날은
  // summarize 가 뺀다). 0164 전 DB 면 조회가 error → 조용히 정규만 센다.
  // 지난달 것도 같이 만든다 — 한 줄 평의 「지난달 N회」 가 이번 달과
  // 다른 잣대로 세어지면 견주는 말이 거짓이 된다.
  const [exSchedQ, exHolQ, exAbsQ] = await Promise.all([
    supabase
      .from("student_extra_schedules")
      .select("id, student_id, label, days, from_date, to_date, off_dates")
      .lte("from_date", to)
      .gte("to_date", `${pym}-01`),
    supabase
      .from("holidays")
      .select("date, scope, class_id")
      .gte("date", `${pym}-01`)
      .lte("date", to),
    supabase.from("student_extra_absences").select("schedule_id, date, status"),
  ]);
  const exScheds = exSchedQ.error ? [] : exSchedQ.data || [];
  const exHols = exHolQ.error ? [] : exHolQ.data || [];
  const exAbs = exAbsQ.error ? [] : exAbsQ.data || [];
  // 이번 달은 **오늘까지만** — 잣대는 위에서 한 번만 정한다 (capTo)
  const extraDatesOf = extraDatesBy(exScheds, ym, exHols, exAbs, { from, to: capTo });
  const prevExtraDatesOf = extraDatesBy(exScheds, pym, exHols, exAbs, {
    from: `${pym}-01`,
    to: endOfMonth(pym),
  });

  // 학교 시험 일정 — 시험 때문에 빠진 것과 그 밖의 이유로 빠진 것을 가른다.
  // 둘을 같이 세면 "시험이라 빠졌는데 왜 지적하냐" 가 되어 말에 힘이 없어진다.
  let ep = await supabase
    .from("exam_periods")
    .select("school, grade, from_date, to_date, hidden")
    .lte("from_date", to)
    .gte("to_date", from);
  if (ep.error) {
    // 0060 전이면 hidden 없이
    ep = await supabase
      .from("exam_periods")
      .select("school, grade, from_date, to_date")
      .lte("from_date", to)
      .gte("to_date", from);
  }
  // 숨긴 시험은 없는 셈 — 결석예정도 안 만들면서 결석 사유로만 남으면 어긋난다 (A6)
  const periods = (ep.error ? [] : ep.data || []).filter((e) => !e.hidden);

  // 이미 만들어 둔 것 (고친 문구 · 보낸 시각)
  const mq = await supabase
    .from("monthly_reports")
    .select("id, student_id, text, note, sent_at")
    .eq("ym", ym);
  const ready = !mq.error;
  const mine = new Map((ready ? mq.data || [] : []).map((r) => [r.student_id, r]));

  const rows = enrolled
    .map((s) => {
      const mineReports = (reports || [])
        .filter((r) => r.student_id === s.id)
        .map((r) => ({ ...r, items: itemsOf.get(r.id) || [] }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const sum = summarize(mineReports, examsOf.get(s.id) || [], extraDatesOf.get(s.id) || []);
      // 이 학생 학교(학년)의 시험 기간만 본다
      sum.offSchedule = offScheduleAbsences(
        mineReports,
        periods.filter((p) => takesExam(s, p))
      );

      // 지난달 — 한 줄 평에서 견주기만 한다 (문구에 지난달 숫자를 늘어놓지는 않는다)
      const before = prevReports
        .filter((r) => r.student_id === s.id)
        .map((r) => ({ ...r, items: itemsOf.get(r.id) || [] }));
      const prev =
        before.length >= 3 ? summarize(before, [], prevExtraDatesOf.get(s.id) || []) : null;

      const saved = mine.get(s.id);
      // 학부모에게 성적이 비공개인 아이 — 자동 문구에서 점수 절을 뺀다 (P0-1)
      const hideScores = s.score_share === "none" || s.score_share === "student";
      const data = { student: s, ym, sum, prev, note: saved?.note || "", hideScores };
      const auto = buildMonthlyText(data, settings.academy.name, msg);
      return {
        scoreHidden: hideScores,
        studentId: s.id,
        name: s.name,
        who: [s.school, s.grade].filter(Boolean).join(" "),
        phone: s.parent_phone || "",
        sum,
        note: saved?.note || "",
        edited: !!saved?.text,
        text: saved?.text || auto,
        auto,
        sentAt: saved?.sent_at || null,
      };
    })
    // 수업이 0회여도 **이미 문구를 보냈거나 손댄 학생은 남긴다** —
    // #16 로 유령 판이 빠지면서 명단째 사라지면, 보낸 월간을 다시
    // 볼 수도 정정할 수도 없게 된다 (검토 경고 반영).
    .filter((r) => r.sum.days > 0 || r.sentAt || r.edited || r.note);

  return { rows, ready, mode: settings.mode };
}

/** 문구를 고쳐 저장하거나, 한마디를 덧붙인다 */
export async function saveMonthly(studentId, ym, patch = {}) {
  if (!studentId || !ym) return { error: "값이 부족해요." };
  const supabase = await createClient();
  const user = await sessionUser(supabase);

  const row = { student_id: studentId, ym, created_by: user?.id || null };
  if ("text" in patch) row.text = (patch.text || "").trim() || null;
  if ("note" in patch) row.note = (patch.note || "").trim() || null;

  const { error } = await supabase
    .from("monthly_reports")
    .upsert(row, { onConflict: "student_id,ym" });
  if (needSql(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/report");
  return { error: null };
}

/**
 * 보낸다 — **앱으로 나간다** (원장님, 2026-08-06).
 *
 * 월간리포트는 재원생 학부모께 가던 것이라 문자·알림톡을 쓰지 않는다.
 * 글이 이미 학부모 화면의 「월간리포트」에 그대로 떠 있으니, 여기서 할 일은
 * **보냈다고 남기고 집으로 알리는 것**뿐이다.
 */
export async function sendMonthly(items, ym) {
  const list = (items || []).filter((x) => x?.studentId);
  if (list.length === 0) return { error: null, count: 0 };

  const supabase = await createClient();
  const channel = "app";

  // 글이 비어 있으면 보낸 것이 아니다 — 열어봐야 아무것도 없다
  const byRef = new Map(
    list.map((x) => [
      x.studentId,
      (x.body || "").trim()
        ? { ok: true, detail: IN_APP_DETAIL }
        : { ok: false, detail: "리포트 글이 비어 있어요." },
    ])
  );

  const okIds = list.filter((x) => byRef.get(x.studentId)?.ok).map((x) => x.studentId);

  if (okIds.length > 0) {
    try {
      // 월간리포트는 **학부모 화면에만** 뜬다 — 어머니 폰으로만 알린다
      await pushToFamilies(
        okIds,
        {
          title: `${monthLabel(ym)} 학습 리포트`,
          body: "한 달 학습 리포트가 올라왔어요. 앱에서 확인해주세요.",
          url: "/parent",
          tag: `monthly-${ym}`,
        },
        "parent"
      );
    } catch {
      /* 알림이 안 가도 리포트는 앱에 그대로 있다 */
    }
  }
  if (okIds.length > 0) {
    const now = new Date().toISOString();
    // **보낸 본문을 같이 저장한다** (2026-08-21). 안 남기면 학부모 화면은
    // text 있는 것만 그려서, 문구를 한 번도 안 고친 학생(대부분)은 알림만
    // 가고 들어가면 빈 화면이었다 — 앱에는 「보냄」 으로 뜨면서.
    const bodyOf = new Map(list.map((x) => [x.studentId, (x.body || "").trim()]));
    const { error } = await supabase.from("monthly_reports").upsert(
      okIds.map((id) => ({ student_id: id, ym, sent_at: now, text: bodyOf.get(id) || null })),
      { onConflict: "student_id,ym" }
    );
    if (needSql(error)) return { error: NEED, count: 0 };
  }

  const failed = list.filter((x) => !byRef.get(x.studentId)?.ok);
  revalidatePath("/report");
  return {
    error: null,
    channel,
    count: okIds.length,
    failed: failed.map((x) => ({
      name: x.name,
      detail: byRef.get(x.studentId)?.detail || "발송 실패",
    })),
  };
}

/** 보낸 표시 되돌리기 */
export async function unsendMonthly(studentId, ym) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("monthly_reports")
    .update({ sent_at: null })
    .eq("student_id", studentId)
    .eq("ym", ym);
  revalidatePath("/report");
  return { error: error ? error.message : null };
}
