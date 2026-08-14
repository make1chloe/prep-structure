"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettings, loadMessageParts } from "@/lib/settings";
import { summarize, buildMonthlyText, monthLabel, offScheduleAbsences } from "@/lib/monthly";
import { IN_APP_DETAIL } from "@/lib/notify";
import { pushToFamilies } from "@/app/push/actions";
import { endOfMonth } from "@/lib/day";
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
  const supabase = createClient();
  const from = `${ym}-01`;
  const to = endOfMonth(ym);

  const settings = await loadSettings(supabase);
  const parts = await loadMessageParts(supabase, settings.message);
  const msg = parts.monthly || settings.message;

  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, parent_phone, status")
    .order("name", { ascending: true });
  const enrolled = (students || []).filter((s) => !s.status || s.status === "enrolled");

  // 지난달까지 같이 읽는다 — 한 줄 평은 **변화**를 말할 때 제일 와닿는다
  const pym = prevYm(ym);
  // 단원평가(0099 — sent_unit)도 여기서 같이 읽는다: **daily_reports 가 원본**이다
  let { data: all, error: allErr } = await supabase
    .from("daily_reports")
    .select("id, student_id, date, attendance_kind, word_correct, word_total, sent_unit, sent_correct, sent_total, sent_passed")
    .gte("date", `${pym}-01`)
    .lte("date", to);
  if (allErr) {
    // 0099 전이면 단원평가 칸 없이
    ({ data: all } = await supabase
      .from("daily_reports")
      .select("id, student_id, date, attendance_kind, word_correct, word_total")
      .gte("date", `${pym}-01`)
      .lte("date", to));
  }
  const reports = (all || []).filter((r) => r.date >= from);
  const prevReports = (all || []).filter((r) => r.date < from);

  const ids = (all || []).map((r) => r.id);
  const { data: items } = ids.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", ids)
        .in("status", ["done", "weak", "missing"])
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
    .filter((r) => (r.sent_unit || "").trim())
    .forEach((r) => putExam({
      student_id: r.student_id,
      date: r.date,
      name: r.sent_passed === false ? `${r.sent_unit.trim()} (재시험)` : r.sent_unit.trim(),
      score: r.sent_correct ?? null,
      total: r.sent_total ?? null,
    }));
  (eq.error ? [] : eq.data || []).forEach((e) => putExam(e));

  // 학교 시험 일정 — 시험 때문에 빠진 것과 그 밖의 이유로 빠진 것을 가른다.
  // 둘을 같이 세면 "시험이라 빠졌는데 왜 지적하냐" 가 되어 말에 힘이 없어진다.
  const ep = await supabase
    .from("exam_periods")
    .select("school, grade, from_date, to_date")
    .lte("from_date", to)
    .gte("to_date", from);
  const periods = ep.error ? [] : ep.data || [];

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
      const sum = summarize(mineReports, examsOf.get(s.id) || []);
      // 이 학생 학교(학년)의 시험 기간만 본다
      sum.offSchedule = offScheduleAbsences(
        mineReports,
        periods.filter((p) => takesExam(s, p))
      );

      // 지난달 — 한 줄 평에서 견주기만 한다 (문구에 지난달 숫자를 늘어놓지는 않는다)
      const before = prevReports
        .filter((r) => r.student_id === s.id)
        .map((r) => ({ ...r, items: itemsOf.get(r.id) || [] }));
      const prev = before.length >= 3 ? summarize(before, []) : null;

      const saved = mine.get(s.id);
      const data = { student: s, ym, sum, prev, note: saved?.note || "" };
      const auto = buildMonthlyText(data, settings.academy.name, msg);
      return {
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
    .filter((r) => r.sum.days > 0);

  return { rows, ready, mode: settings.mode };
}

/** 문구를 고쳐 저장하거나, 한마디를 덧붙인다 */
export async function saveMonthly(studentId, ym, patch = {}) {
  if (!studentId || !ym) return { error: "값이 부족해요." };
  const supabase = createClient();
  const user = await sessionUser(supabase);

  const row = { student_id: studentId, ym, created_by: user?.id || null };
  if ("text" in patch) row.text = (patch.text || "").trim() || null;
  if ("note" in patch) row.note = (patch.note || "").trim() || null;

  const { error } = await supabase
    .from("monthly_reports")
    .upsert(row, { onConflict: "student_id,ym" });
  if (needSql(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/monthly");
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

  const supabase = createClient();
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
    const { error } = await supabase.from("monthly_reports").upsert(
      okIds.map((id) => ({ student_id: id, ym, sent_at: now })),
      { onConflict: "student_id,ym" }
    );
    if (needSql(error)) return { error: NEED, count: 0 };
  }

  const failed = list.filter((x) => !byRef.get(x.studentId)?.ok);
  revalidatePath("/monthly");
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
  const supabase = createClient();
  const { error } = await supabase
    .from("monthly_reports")
    .update({ sent_at: null })
    .eq("student_id", studentId)
    .eq("ym", ym);
  revalidatePath("/monthly");
  return { error: error ? error.message : null };
}
