/** 로드맵 08 의 손 — 판 읽기(한 벌 road_board · 제 아이만) · 아이가 찍기(세 겹 문 0052 — 열려 있을 때 · 원장·검사가 찍은 줄은 못 덮는다 · 확인 기다리는 중으로) · ❗ 이의(진도는 안 바뀐다).
 *  판단은 lib/road-plan.js(순수) · 진도 값의 뜻은 lib/progress-plan.js 한 벌(확정-51 표 하나 · 보기 넷) */
import { db } from "./supabase.js";
import { TRI } from "./progress-plan.js";
import { FLAG_KIND, rowMarkable } from "./road-plan.js";
import { changed, row, rows } from "./sqlError.js";
export async function roadBoard(sb, studentId, bookId, date) {
  const read = async (b) => { const { data, error } = await db(sb).rpc("road_board", { p_student: studentId, p_book: b, p_on: date }); if (error) throw new Error(`로드맵을 못 읽음: ${error.message}`); if (!data) throw new Error("내 교재만 볼 수 있어요"); return data; };
  let d = await read(bookId ?? null);
  if (!bookId && d.books?.length) d = await read(d.books[0].book_id);   // 교재를 안 고르면 첫 교재 — 조회 하나 더(한 번뿐)
  return d;
}
/** 아이가 찍는다 — ○ done · ◐ doing · · none. 원장·검사가 찍은 줄은 못 덮는다(RLS 0052 ② 와 같은 문 — 여기서 먼저 말해 준다) · 「확인 기다리는 중」으로 선다 */
export async function studentMark(sb, { studentId, unitId, round, status, date }) {
  if (!TRI.some(([k]) => k === status)) throw new Error(`진도 값이 아닙니다: ${status}`);
  const prev = row(await db(sb).from("progress").select("status,last_by,confirmed").eq("student_id", studentId).eq("unit_id", unitId).eq("round", round).maybeSingle(), "진도를 못 읽음");
  if (prev && prev.last_by !== "student" && prev.status !== "none") throw new Error("원장님이 찍은 줄은 못 바꿔요 — 잘못됐으면 ❗ 를 달아 주세요");
  const patch = { status, last_by: "student", confirmed: false, marked_on: date, done_on: status === "done" ? date : null };
  if (prev) changed(await db(sb).from("progress").update(patch).eq("student_id", studentId).eq("unit_id", unitId).eq("round", round).select("unit_id"), "진도를 못 찍음", { zero: "ok" });
  else row(await db(sb).from("progress").insert({ student_id: studentId, unit_id: unitId, round, ...patch }).select("unit_id"), "진도를 못 찍음");
  return { status, pending: true };
}
/** (허) 대단원 통째로 — 08 「아직」 칸의 ○ ◐ · . 원장·검사가 찍은 줄은 **막지 않고 건너뛴다**(몇 줄을 건너뛰었는지 돌려준다).
 *  읽기 한 번 · 쓰기 한 번(줄마다 부르지 않는다 — 속도 대원칙 1) · 전부 「확인 기다리는 중」으로 선다 */
export async function studentMarkMany(sb, { studentId, unitIds, round, status, date }) {
  if (!TRI.some(([k]) => k === status)) throw new Error(`진도 값이 아닙니다: ${status}`);
  const ids = [...new Set((unitIds ?? []).map(String).filter((u) => /^[0-9a-f-]{36}$/.test(u)))];
  if (!ids.length) throw new Error("찍을 소단원이 없어요");
  const prev = rows(await db(sb).from("progress").select("unit_id,status,last_by,confirmed").eq("student_id", studentId).eq("round", round).in("unit_id", ids), "진도를 못 읽음");
  const by = new Map(prev.map((p) => [p.unit_id, p]));
  const mine = ids.filter((id) => rowMarkable(by.get(id) ?? null));
  if (!mine.length) throw new Error("원장님이 찍으신 줄뿐이에요 — 잘못됐으면 ❗ 를 달아 주세요");
  const patch = { status, last_by: "student", confirmed: false, marked_on: date, done_on: status === "done" ? date : null };
  changed(await db(sb).from("progress").upsert(mine.map((id) => ({ student_id: studentId, unit_id: id, round, ...patch })), { onConflict: "student_id,unit_id,round" }).select("unit_id"), "진도를 못 찍음");
  return { marked: mine.length, skipped: ids.length - mine.length, pending: true };
}
/** ❗ 달기 — 진도는 안 바뀐다. 원장님이 볼 때까지 그대로 */
export async function raiseFlag(sb, { studentId, unitId, round, kind, said = null }) {
  if (!FLAG_KIND.some(([k]) => k === kind)) throw new Error(`❗ 갈래가 아닙니다: ${kind}`);
  const s = String(said ?? "").trim() || null; if (kind === "other" && !s) throw new Error("무엇이 잘못됐는지 한 줄 적어 주세요");
  const ins = row(await db(sb).from("progress_flag").insert({ student_id: studentId, unit_id: unitId, round, kind, said: s }).select("id").single(), "❗ 를 못 달음");
  return ins.id;
}
