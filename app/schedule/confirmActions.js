"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/session";
import { todaySeoul, addMonths } from "@/lib/day";
import { fetchAll } from "@/lib/fetchAll";
import { monthPlan, examUndecided } from "@/lib/monthPlan";
import { postAppNotices } from "@/lib/notify";
import { pushToFamilies } from "@/app/push/actions";
import { takesExam } from "@/lib/who";
import { loadRunningClasses } from "@/lib/classTerm";

/**
 * **다음 달 일정 확정** (0123, 원장님 2026-08-14~15).
 *
 * 흐름: 학부모가 다음 달 결석을 requests 로 보내고 → 「다음 달 일정 1차
 * 확인」 을 누른다(결석 없어도) → 원장님이 공휴일·시험 겹침까지 보고
 * 학생별로 회차를 확정한다. 25일까지 확정이 안 남으면 배지로 독촉.
 * 수납 안내는 앱 밖 — 여기서는 확정됐다는 상태만 보인다.
 */

/** 다음 달 'YYYY-MM' */
export async function nextYm() {
  return addMonths(todaySeoul().slice(0, 7), 1);
}


/**
 * **일정이 바뀌면 「다시 보내야 함」 으로 되돌린다** (0152).
 *
 * 이미 나간 공지 본문은 고정 문자열이라 안 바뀌는데, 앱 달력은 휴강·결석을
 * 실시간으로 읽어 저절로 바뀐다. 그대로 두면 같은 달 일정이 공지와 달력에서
 * 서로 다르게 보인다 — 원칙 1 이 제일 싫어하는 모양이다.
 * 그래서 그 달 안내 도장을 지운다. 확정까지 끝난 달은 건드리지 않는다
 * (지난 일을 들쑤셔 재촉을 켜지 않는다).
 *
 * 조용히 실패한다 — 휴강을 넣는 일 자체가 이것 때문에 막히면 안 된다.
 */
export async function clearMonthNotice(ym) {
  if (!ym) return;
  try {
    const supabase = await createClient();
    await supabase
      .from("month_confirms")
      .update({ notice_at: null })
      .eq("ym", ym)
      .is("principal_at", null);
  } catch { /* 0152 전이거나 권한 문제 — 조용히 */ }
}

/** 학부모 — 이 아이의 다음 달 일정을 1차 확인 */
export async function parentConfirmMonth(studentId) {
  if (!studentId) return { error: "어느 학생인지 모르겠어요." };
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  const ym = addMonths(todaySeoul().slice(0, 7), 1);
  const { error } = await supabase.from("month_confirms").upsert(
    {
      student_id: studentId,
      ym,
      parent_at: new Date().toISOString(),
      parent_by: user?.id || null,
    },
    { onConflict: "student_id,ym" }
  );
  if (error && (error.code === "42P01" || error.code === "PGRST205")) {
    return { error: "아직 준비 중이에요 — 학원에 말씀해주세요. (0123)" };
  }
  revalidatePath("/parent");
  revalidatePath("/schedule");
  return { error: error ? error.message : null, ym };
}


/**
 * **예상 수업일정을 먼저 보낸다** (원장님 2026-08-23 — 「먼저 일정을 보내고
 * 봐라, 결석 이 중에 있냐 물어보는 거지」).
 *
 * 순서가 뒤집혔다. 전에는 학부모가 결석을 먼저 보내야 했다:
 *   (옛) 학부모 결석 알림 → 원장 반영 → 학부모 확인 → 원장 확정
 *   (새) **원장 일정 보냄** → 학부모가 빠질 날 알림 → 원장 반영 → 원장 확정
 *
 * 회차는 `sessionNumbers` 한 벌을 그대로 쓴다 (lib/monthPlan) — 본문에서
 * 다시 세면 앱 달력과 숫자가 갈라진다.
 *
 * 보내는 길은 이미 있는 것을 쓴다 — 앱 공지(postAppNotices) + 학부모 푸시.
 * 재원생에게는 문자·알림톡이 나가지 않는다 (lib/notify 대원칙).
 */
export async function sendMonthPlan(studentIds, ym) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0 || !ym) return { error: "학생을 골라주세요." };
  const supabase = await createClient();
  const user = await sessionUser(supabase);

  const [stQ, clsRows, csQ, hqQ, absQ, exQ, setQ] = await Promise.all([
    supabase.from("students").select("id, name, school, grade").in("id", ids),
    loadRunningClasses(supabase, "id, name, days, start_time, category"),
    supabase.from("class_students").select("class_id, student_id").in("student_id", ids),
    supabase.from("holidays").select("date, scope, class_id").like("date", `${ym}%`),
    fetchAll(() => supabase
      .from("attendance")
      .select("student_id, date, reason, status")
      .in("student_id", ids)
      .like("date", `${ym}%`)
      .order("student_id").order("date")),
    supabase.from("exams").select("id, school, grade, term, english_on, from_date, to_date, hidden"),
    // 보강만 하는 요일은 정규 회차가 아니다 — 앱 달력과 같은 자리에서 읽는다
    supabase.from("integrations").select("config").eq("id", "schedule").maybeSingle(),
  ]);
  if (stQ.error) return { error: stQ.error.message };

  const classes = clsRows || [];
  const clsOf = new Map();
  for (const r of csQ.data || []) {
    if (!clsOf.has(r.student_id)) clsOf.set(r.student_id, []);
    const k = classes.find((c) => c.id === r.class_id);
    if (k) clsOf.get(r.student_id).push(k);
  }
  const offAll = new Set((hqQ.data || []).filter((h) => h.scope !== "class").map((h) => h.date));
  const offBy = new Map();
  for (const h of (hqQ.data || []).filter((h) => h.scope === "class" && h.class_id)) {
    if (!offBy.has(h.class_id)) offBy.set(h.class_id, new Set());
    offBy.get(h.class_id).add(h.date);
  }
  const absOf = new Map();
  for (const a of (absQ.error ? [] : absQ.data || [])) {
    if (a.status !== "absent") continue;
    if (!absOf.has(a.student_id)) absOf.set(a.student_id, []);
    absOf.get(a.student_id).push({ date: a.date, reason: a.reason || "" });
  }
  const exams = (exQ.data || []).filter((e) => !e.hidden);
  // 원장님이 주신 문구 그대로 (2026-08-23)
  const UNDECIDED =
    "영어 시험기간이 아직 공지되지 않은 경우 해당 사항에 대한 변동이 있을 수 있습니다.";
  const makeupDays = (setQ && setQ.data && setQ.data.config && setQ.data.config.makeupDays) || [];

  const month = Number(ym.slice(5, 7));
  const rows = [];
  for (const st of stQ.data || []) {
    const ks = clsOf.get(st.id) || [];
    if (ks.length === 0) continue;   // 반이 없으면 보낼 일정도 없다
    const offOf = (cid) => new Set([...offAll, ...(offBy.get(cid) || [])]);
    const plan = monthPlan(ks, ym, offOf, makeupDays, absOf.get(st.id) || []);
    if (plan.count === 0) continue;

    const parts = [
      `${month}월 예상 수업일정입니다. (${plan.count}회)`,
      "",
      ...plan.lines,
    ];
    if (plan.absents.length) {
      parts.push("", `※ 알려주신 결석 예정 — ${plan.absents.join(" · ")}`);
    }
    parts.push("", "빠질 날이 더 있으면 앱에서 알려주세요. 확인 후 일정을 확정합니다.");
    if (examUndecided(exams.filter((e) => takesExam(st, e)))) {
      parts.push("", UNDECIDED);
    }
    rows.push({ studentId: st.id, title: `${month}월 예상 수업일정`, body: parts.join("\n") });
  }
  if (rows.length === 0) return { error: "보낼 일정이 없어요 (반 배정을 먼저 해주세요)." };

  const { ok, failed } = await postAppNotices(supabase, rows, {
    date: todaySeoul(),
    kind: "schedule",
    createdBy: user?.id || null,
  });
  if (ok.length) {
    await pushToFamilies(ok, { title: `${month}월 예상 수업일정`, url: "/parent" }, "parent", supabase);
    const now = new Date().toISOString();
    const { error } = await supabase.from("month_confirms").upsert(
      ok.map((sid) => ({ student_id: sid, ym, notice_at: now })),
      { onConflict: "student_id,ym" }
    );
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      return { error: "0152 SQL 을 먼저 실행해주세요 (설정 → 관리자 → SQL).", sent: ok.length };
    }
  }
  revalidatePath("/schedule");
  revalidatePath("/parent");
  return { error: null, sent: ok.length, failed: failed.length };
}

/** 원장 — 학생들의 다음 달 회차를 확정 (여럿 한 번에) */
export async function principalConfirmMonth(studentIds, ym) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0 || !ym) return { error: "학생을 골라주세요." };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("month_confirms").upsert(
    ids.map((sid) => ({ student_id: sid, ym, principal_at: now })),
    { onConflict: "student_id,ym" }
  );
  if (error && (error.code === "42P01" || error.code === "PGRST205")) {
    return { error: "0123 SQL 을 먼저 실행해주세요 (관리자 → 설정 → SQL)." };
  }
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}

/** 원장 — 확정을 되돌린다 (잘못 눌렀을 때) */
export async function principalUnconfirmMonth(studentId, ym) {
  if (!studentId || !ym) return { error: "값이 부족해요." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("month_confirms")
    .update({ principal_at: null })
    .eq("student_id", studentId)
    .eq("ym", ym);
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}
