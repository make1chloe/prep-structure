/** 🏫 반 손(4단계-3a) — 판 · 만들기(반 + 시간표) · 시간표 바꾸기(이 날부터 — 옛 줄은 닫는다, 지우지 않는다) · 이름·갈래 · 명단 넣기·빼기(기간) · 반 단가 줄 · 반 닫기 · 그 시각 아이 수. 판단은 lib/class-plan */
import { db } from "./supabase.js";
import { parseClass, parseSchedule, parseClassFee } from "./class-plan.js";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data; };
const dayBefore = (d) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
export async function classBoard(sb, date) {
  const { data, error } = await db(sb).rpc("class_board", { p_on: date });
  if (error) throw new Error(`반 판을 못 읽음: ${error.message}`);
  if (!data) throw new Error("반은 학원 사람의 화면입니다");
  return data;
}
/** + 반 만들기 = 반 줄 + 첫 시간표 — 시간표가 안 서면 「시간표 없음」으로 보여 다시 적는다(반은 남는다) */
export async function addClass(sb, f) {
  const p = parseClass(f);
  const c = row(await db(sb).from("classes").insert({ kind: p.kind, nickname: p.nickname, state: "active" }).select("id").single(), "반을 못 만듦");
  row(await db(sb).from("class_schedule").insert({ class_id: c.id, from_date: p.fromDate, weekdays: p.weekdays, start_time: p.start, end_time: p.end }).select("id"), "시간표를 못 적음");
  return { id: c.id };
}
/** 시간표 바꾸기 — 이 날부터. 같은 날부터면 그 줄을 고치고, 뒤 날이면 지금 줄을 전날에 닫고 새 줄(옛 회차는 옛 시간표로 남는다) */
export async function setSchedule(sb, classId, f) {
  const p = parseSchedule(f);
  const cur = row(await db(sb).from("class_schedule").select("id,from_date,to_date").eq("class_id", classId).is("to_date", null).order("from_date", { ascending: false }).limit(1), "시간표를 못 읽음")?.[0] ?? null;
  if (cur && cur.from_date >= p.fromDate) {
    if (cur.from_date > p.fromDate) throw new Error(`지금 시간표가 ${cur.from_date}부터라 그보다 앞으로는 못 바꿉니다`);
    row(await db(sb).from("class_schedule").update({ weekdays: p.weekdays, start_time: p.start, end_time: p.end }).eq("id", cur.id).select("id"), "시간표를 못 고침");
    return { id: cur.id, replaced: true };
  }
  if (cur) row(await db(sb).from("class_schedule").update({ to_date: dayBefore(p.fromDate) }).eq("id", cur.id).select("id"), "옛 시간표를 못 닫음");
  const ins = row(await db(sb).from("class_schedule").insert({ class_id: classId, from_date: p.fromDate, weekdays: p.weekdays, start_time: p.start, end_time: p.end }).select("id").single(), "시간표를 못 적음");
  return { id: ins.id, replaced: false };
}
export async function setClassName(sb, classId, nickname, kind) {
  const p = parseClass({ nickname, kind, weekdays: [1], start: "00:00", end: "00:01", fromDate: "2000-01-01" });
  const r = row(await db(sb).from("classes").update({ nickname: p.nickname, kind: p.kind }).eq("id", classId).select("id"), "반을 못 고침");
  if (!r?.length) throw new Error("반이 없습니다");
}
/** 반 닫기 — 그날부터 없는 반: 상태 closed · 시간표·명단·단가 줄을 전날까지로 닫는다(지우지 않는다 · 대전제-6 · 옛 회차는 그대로).
 *  그날보다 뒤에 시작하는 줄(예약된 시간표 · 다음 달 단가)은 시작도 못 한 빈 기간으로 남긴다 — fee_rule 은 to_date ≥ from_date 제약이라 시작일 하루로(반이 closed 라 세지 않는다) */
export async function closeClass(sb, classId, on) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(on ?? ""))) throw new Error("닫는 날을 적으세요");
  const r = row(await db(sb).from("classes").update({ state: "closed" }).eq("id", classId).select("id"), "반을 못 닫음"); if (!r?.length) throw new Error("반이 없습니다");
  const last = dayBefore(on);
  const sch = row(await db(sb).from("class_schedule").select("id,from_date").eq("class_id", classId).is("to_date", null), "시간표를 못 읽음") ?? [];
  for (const x of sch) row(await db(sb).from("class_schedule").update({ to_date: x.from_date > last ? dayBefore(x.from_date) : last }).eq("id", x.id).select("id"), "시간표를 못 닫음");
  const mem = row(await db(sb).from("class_member").select("student_id,from_date").eq("class_id", classId).is("to_date", null), "명단을 못 읽음") ?? [];
  for (const m of mem) row(await db(sb).from("class_member").update({ to_date: m.from_date > last ? dayBefore(m.from_date) : last }).eq("class_id", classId).eq("student_id", m.student_id).eq("from_date", m.from_date).select("class_id"), "명단을 못 닫음");
  const fees = row(await db(sb).from("fee_rule").select("id,from_date").eq("class_id", classId).is("student_id", null).is("to_date", null), "단가 줄을 못 읽음") ?? [];
  for (const f of fees) row(await db(sb).from("fee_rule").update({ to_date: f.from_date > last ? f.from_date : last }).eq("id", f.id).select("id"), "단가 줄을 못 닫음");
}
/** 명단에 넣기 — 이 날부터(같은 아이가 두 반이어도 된다 · 옮기기는 14 의 setClass). 이미 있으면 막는다 */
export async function addMember(sb, classId, studentId, fromDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate ?? ""))) throw new Error("언제부터인지(날짜)를 적으세요");
  const cur = row(await db(sb).from("class_member").select("class_id").eq("class_id", classId).eq("student_id", studentId).is("to_date", null), "명단을 못 읽음") ?? [];
  if (cur.length) throw new Error("이미 이 반에 있는 아이입니다");
  row(await db(sb).from("class_member").insert({ class_id: classId, student_id: studentId, from_date: fromDate }).select("class_id"), "명단에 못 넣음");
}
/** 명단에서 빼기 — 그날부터 안 나온다 = 마지막 날은 전날(to_date 는 마지막 날 · 줄은 남는다 · 이력). 그날 넣었다 그날 빼면 빈 기간(to_date < from_date)으로 남는다 — 지우지 않는다(대전제-6), 판·회차·수강료는 기간 겹침으로 세어 안 친다 */
export async function removeMember(sb, classId, studentId, on) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(on ?? ""))) throw new Error("언제부터 안 나오는지(날짜)를 적으세요");
  const r = row(await db(sb).from("class_member").update({ to_date: dayBefore(on) }).eq("class_id", classId).eq("student_id", studentId).is("to_date", null).select("class_id"), "명단에서 못 뺌");
  if (!r?.length) throw new Error("이 반에 없는 아이입니다");
}
/** 반 단가 줄 — 이 날부터 얼마(달마다 · 회차제). 앞 줄은 전날에 닫는다 — 13 수강료의 단가 줄과 같은 표(fee_rule.class_id) */
export async function setClassFee(sb, classId, f) {
  const p = parseClassFee(f);
  const cur = row(await db(sb).from("fee_rule").select("id,from_date").eq("class_id", classId).is("student_id", null).is("to_date", null).order("from_date", { ascending: false }).limit(1), "단가 줄을 못 읽음")?.[0] ?? null;
  if (cur && cur.from_date >= p.fromDate) { row(await db(sb).from("fee_rule").update({ amount: p.amount, per_session: p.perSession }).eq("id", cur.id).select("id"), "단가 줄을 못 고침"); return { id: cur.id }; }
  if (cur) row(await db(sb).from("fee_rule").update({ to_date: dayBefore(p.fromDate) }).eq("id", cur.id).select("id"), "옛 단가 줄을 못 닫음");
  const ins = row(await db(sb).from("fee_rule").insert({ class_id: classId, student_id: null, amount: p.amount, per_session: p.perSession, from_date: p.fromDate }).select("id").single(), "단가 줄을 못 더함");
  return { id: ins.id };
}
/** 그 시각에 있는 아이 수(02c 보강 자리 — 확정-㉔ 보여만 준다) */
export async function slotCount(sb, date, time) {
  const { data, error } = await db(sb).rpc("slot_count", { p_date: date, p_time: time });
  if (error) throw new Error(`그 시각 아이 수를 못 셈: ${error.message}`);
  return data ?? { classes: [], makeups: 0 };
}
