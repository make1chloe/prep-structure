/** 결석·지각 예정(v2.makeup · v2.late_plan) 한 벌 — 달력에서 날짜를 고른다(확정-㉔). 보강 시각은 앱이 제안하지 않는다 — 원장님이 달력을 열어 직접.
 *  결석 예정 = 보강 줄 하나(of_date 빠지는 날 · state todo/set/waived) — 「그날 보강인가」도 여기서 세어 나온다. 지각 예정 = late_plan 한 줄. 물리면 지우지 않고 cancelled(대전제-6).
 *  수업일은 SQL v2.student_days 한 곳. 결석 예정인 날은 판이 안 서고 숙제가 안 나간다(lib/day.js 가 여기 것을 읽는다). 학부모 알림은 큐에 넣는다(발송 10 이 보낸다) */
import { db } from "./supabase.js";
import { enqueue } from "./queue.js";
import { markOf, LATE_PRESET } from "./plan-plan.js";
export { LATE_PRESET };
const live = (q) => q.not("state", "in", '("done","cancelled")');
/** 오늘 명단이 읽는 것 — 오늘 빠지는 아이(결석 예정) · 오늘 보강으로 오는 아이 · 오늘 지각 예정. 한 파도(셋 나란히) */
export async function plansToday(sb, date) {
  const [abs, mk, late] = await Promise.all([
    live(db(sb).from("makeup").select("id,student_id,of_date,on_date,at_time,state,reason").eq("of_date", date)),
    db(sb).from("makeup").select("id,student_id,of_date,on_date,at_time,state,students!inner(id,name,grade,state,school_id)").eq("on_date", date).eq("state", "set").eq("students.state", "active"),
    db(sb).from("late_plan").select("id,student_id,date,minutes,reason").eq("date", date).is("cancelled_at", null),
  ]);
  for (const r of [abs, mk, late]) if (r.error) throw new Error(`예정을 못 읽음: ${r.error.message}`);
  return { absent: abs.data ?? [], makeup: mk.data ?? [], late: late.data ?? [] };
}
/** 02c 가 여는 것 — 그 아이의 한 달(앞뒤 여유) 수업일·휴강·보강 · 결석 예정 · 지각 예정 · 반 요일·시각 글 */
export async function planOpen(sb, studentId, ym) {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1 - 7)).toISOString().slice(0, 10), to = new Date(Date.UTC(y, m, 7)).toISOString().slice(0, 10);
  const [days, abs, lates, sched] = await Promise.all([
    db(sb).rpc("student_days", { p_student: studentId, p_from: from, p_to: to }),
    live(db(sb).from("makeup").select("id,of_date,on_date,at_time,state,reason,notified_at").eq("student_id", studentId)).gte("of_date", from).lte("of_date", to),
    db(sb).from("late_plan").select("id,date,minutes,reason,notified_at").eq("student_id", studentId).is("cancelled_at", null).gte("date", from).lte("date", to),
    db(sb).from("class_member").select("class_id,to_date,classes!inner(nickname,state,class_schedule(weekdays,start_time,to_date))").eq("student_id", studentId).eq("classes.state", "active"),
  ]);
  for (const r of [days, abs, lates, sched]) if (r.error) throw new Error(`예정을 못 읽음: ${r.error.message}`);
  const W = ["일", "월", "화", "수", "목", "금", "토"];
  const label = (sched.data ?? []).filter((c) => !c.to_date).flatMap((c) => (c.classes.class_schedule ?? []).filter((s) => !s.to_date).map((s) => `${(s.weekdays ?? []).map((d) => W[d]).join("·")} ${String(s.start_time ?? "").slice(0, 5)}`)).join(" / ");
  return { ym, days: (days.data ?? []).map((d) => ({ date: d.date, kind: d.kind, class_id: d.class_id, start_time: d.start_time })), absences: abs.data ?? [], lates: lates.data ?? [], label };
}
/** 저장 — 그날을 결석(사유 · 보강 날짜·시각 · 안 잡음) / 지각(얼마나 · 사유) / 없음(물림)으로. 수업일만 고를 수 있다 */
export async function planSave(sb, studentId, date, { kind, reason = null, makeupOn = null, makeupAt = null, waived = false, minutes = null }, by) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error(`날짜가 아닙니다: ${date}`);
  const { data: days, error } = await db(sb).rpc("student_days", { p_student: studentId, p_from: date, p_to: date });
  if (error) throw new Error(`수업일을 못 읽음: ${error.message}`);
  const mark = markOf(date, { days: days ?? [] });
  const [abs, lt] = await Promise.all([
    live(db(sb).from("makeup").select("id,state").eq("student_id", studentId).eq("of_date", date)).maybeSingle(),
    db(sb).from("late_plan").select("id").eq("student_id", studentId).eq("date", date).is("cancelled_at", null).maybeSingle(),
  ]);
  const cancelAbs = async () => { if (abs.data) { const { error: e } = await db(sb).from("makeup").update({ state: "cancelled" }).eq("id", abs.data.id); if (e) throw new Error(`결석 예정을 못 물림: ${e.message}`); } };
  const cancelLate = async () => { if (lt.data) { const { error: e } = await db(sb).from("late_plan").update({ cancelled_at: new Date().toISOString() }).eq("id", lt.data.id); if (e) throw new Error(`지각 예정을 못 물림: ${e.message}`); } };
  if (kind === "none") { await cancelAbs(); await cancelLate(); return { kind }; }
  if (!mark.pick && mark.kind !== "absent" && mark.kind !== "late") throw new Error(mark.kind === "off" ? "휴강일입니다" : "수업일만 고를 수 있습니다");
  if (kind === "absent") {
    await cancelLate();
    const state = waived ? "waived" : makeupOn ? "set" : "todo";
    const row = { student_id: studentId, of_date: date, on_date: makeupOn || null, at_time: makeupAt || null, state, reason: String(reason ?? "").trim() || null, created_by: by ?? null };
    const { error: e } = abs.data ? await db(sb).from("makeup").update(row).eq("id", abs.data.id) : await db(sb).from("makeup").insert(row);
    if (e) throw new Error(`결석 예정을 못 씀: ${e.message}`);
    return { kind, state };
  }
  if (kind === "late") {
    await cancelAbs();
    const min = minutes == null || minutes === "" ? null : Number(minutes);
    if (min !== null && (!Number.isInteger(min) || min <= 0)) throw new Error("얼마나 늦는지는 분(1 이상)으로");
    const row = { student_id: studentId, date, minutes: min, reason: String(reason ?? "").trim() || null, created_by: by ?? null };
    const { error: e } = lt.data ? await db(sb).from("late_plan").update(row).eq("id", lt.data.id) : await db(sb).from("late_plan").insert(row);
    if (e) throw new Error(`지각 예정을 못 씀: ${e.message}`);
    return { kind };
  }
  throw new Error(`갈래가 아닙니다: ${kind}`);
}
/** 📨 학부모께 알림 — 그날 예정(결석·지각)을 큐에 넣고 알림 때를 적는다. 보내는 손은 발송 10 */
export async function planNotify(sb, studentId, date) {
  const [abs, lt] = await Promise.all([
    live(db(sb).from("makeup").select("id,of_date,on_date,at_time,state,reason").eq("student_id", studentId).eq("of_date", date)).maybeSingle(),
    db(sb).from("late_plan").select("id,minutes,reason").eq("student_id", studentId).eq("date", date).is("cancelled_at", null).maybeSingle(),
  ]);
  const plan = abs.data ? { kind: "absent", ...abs.data } : lt.data ? { kind: "late", ...lt.data } : null;
  if (!plan) throw new Error("그날 예정이 없습니다 — 먼저 저장하세요");
  const table = plan.kind === "absent" ? "makeup" : "late_plan";
  await enqueue(sb, "attend_plan_notice", { student_id: studentId, date, kind: plan.kind, plan_id: plan.id }, { table, id: plan.id });
  const { error } = await db(sb).from(table).update({ notified_at: new Date().toISOString() }).eq("id", plan.id);
  if (error) throw new Error(`알림 때를 못 적음: ${error.message}`);
}
