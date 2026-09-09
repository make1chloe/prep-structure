/** 시험 회차 06b 의 손 — 판 읽기(한 벌 exam_board) · 범위 더하기(교재 단원 · 글) · 빼기(removed_on — 지우지 않는다) · 「안 봄」 · 「숨김」 · 몇 주 전부터(규칙 줄 · 아이 따로) ·
 *  교재 멈춤을 회차에 맞춘다(syncStops: 영어 시험일 − N주 ~ 시험 끝 — 보는 아이의 정규 교재 전부 · 내신 교재는 돈다 · 손으로 멈춘 것은 안 건드린다) · 지금 멈춤 · 풀기.
 *  (저) 「봤음」(나이스가 옮긴 기간 · 0152 · 확정-69) · 새벽 정리(syncStopsDaily — 크론 한 바퀴 앞에 앞으로의 회차 멈춤을 다시 맞춘다).
 *  판단은 lib/exam-plan.js(순수) · 멈춤 판정은 lib/routine-plan.js stopOn 한 곳. 지우지 않는다(대전제-6) */
import { db } from "./supabase.js";
import { ruleMap } from "./rule.js";
import { weeksFor, stopWindow, LEVELS, examEnd } from "./exam-plan.js";
import { changed, row } from "./sqlError.js";
import { beforeRun } from "./queue.js";
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
const alive = (q, date) => q.lte("from_date", date).or(`to_date.is.null,to_date.gte.${date}`);
export async function examBoard(sb, date) {
  const { data, error } = await db(sb).rpc("exam_board", { p_on: date });
  if (error) throw new Error(`시험 회차 판을 못 읽음: ${error.message}`);
  if (!data) throw new Error("시험 회차는 학원 사람의 화면입니다");
  return data;
}
/** 범위를 고르려고 — 그 교재의 단원(대단원 › 소단원 · 짧은 이름) */
export async function unitsOf(sb, bookId) {
  if (!bookId) throw new Error("교재를 고르세요");
  return row(await db(sb).from("units").select("id,chapter,sub,activity,sort,short,label").eq("book_id", bookId).eq("state", "active").order("sort"), "단원을 못 읽음") ?? [];
}
/** + 범위 — 교재 단원(여럿) 또는 글 한 줄. 이미 있는 단원은 건너뛰고, 뺐던 단원은 되살린다 */
export async function addScope(sb, examId, { unitIds = [], freeNote = null, date }) {
  if (!examId) throw new Error("회차가 없습니다"); if (!isDate(date)) throw new Error(`날짜가 아닙니다: ${date}`);
  const ids = [...new Set((unitIds ?? []).filter(Boolean))], note = String(freeNote ?? "").trim() || null;
  if (!ids.length && !note) throw new Error("단원을 고르거나 글로 적으세요");
  if (ids.length) {
    const units = row(await db(sb).from("units").select("id,book_id").in("id", ids), "단원을 못 읽음") ?? [];
    if (units.length !== ids.length) throw new Error("없는 단원이 있습니다");
    const have = row(await db(sb).from("prep_scope").select("id,unit_id,removed_on").eq("exam_id", examId).in("unit_id", ids), "범위를 못 읽음") ?? [];
    const back = have.filter((h) => h.removed_on).map((h) => h.id), has = new Set(have.map((h) => h.unit_id));
    if (back.length) changed(await db(sb).from("prep_scope").update({ removed_on: null, added_on: date }).in("id", back).select("id"), "범위를 못 되살림", { zero: "ok" });
    const fresh = units.filter((u) => !has.has(u.id)).map((u) => ({ exam_id: examId, book_id: u.book_id, unit_id: u.id, added_on: date }));
    if (fresh.length) row(await db(sb).from("prep_scope").insert(fresh).select("id"), "범위를 못 더함");
    return { added: fresh.length + back.length, already: ids.length - fresh.length - back.length };
  }
  row(await db(sb).from("prep_scope").insert({ exam_id: examId, free_note: note, added_on: date }).select("id"), "범위를 못 더함");
  return { added: 1, already: 0 };
}
/** 학교가 뺌 — 지우지 않고 removed_on 을 찍는다(0013) */
export async function removeScope(sb, ids = [], date) {
  const list = (ids ?? []).filter(Boolean); if (!list.length) throw new Error("뺄 범위가 없습니다"); if (!isDate(date)) throw new Error(`날짜가 아닙니다: ${date}`);
  const r = changed(await db(sb).from("prep_scope").update({ removed_on: date }).in("id", list).is("removed_on", null).select("id"), "범위를 못 뺌", { zero: "ok" }) ?? [];
  if (!r.length) throw new Error("이미 뺀 범위입니다");
  return r.length;
}
/** 「안 봄」 — 아이 × 회차. 되돌리면 skipped=false. 보는 아이가 달라지니 멈춤도 다시 맞춘다 */
export async function setSkip(sb, examId, studentId, skipped, date) {
  if (!examId || !studentId) throw new Error("회차와 아이가 있어야 합니다");
  changed(await db(sb).from("exam_skip").upsert({ exam_id: examId, student_id: studentId, skipped: Boolean(skipped) }, { onConflict: "exam_id,student_id" }).select("exam_id"), "안 봄을 못 적음");
  return syncStops(sb, examId, date);
}
/** 「이 학년 안 봄 한 번에」((가)-⑨ · 남긴 것 18) — 남은 아이 전부를 한 문장으로 안 봄 · 멈춤은 한 번만 다시 맞춘다 */
export async function setSkipAll(sb, examId, studentIds = [], date) {
  const ids = [...new Set((studentIds ?? []).filter(Boolean))]; if (!examId || !ids.length) throw new Error("안 볼 아이가 없습니다");
  changed(await db(sb).from("exam_skip").upsert(ids.map((sid) => ({ exam_id: examId, student_id: sid, skipped: true })), { onConflict: "exam_id,student_id" }).select("exam_id"), "안 봄을 못 적음");
  const r = await syncStops(sb, examId, date); return { ...(r ?? {}), n: ids.length };
}
/** 「숨김」 — 회차 통째로(9/5 ⑳). 숨기면 묶인 멈춤은 풀린다 */
export async function setHidden(sb, examId, hidden, date) {
  const r = changed(await db(sb).from("exams").update({ hidden: Boolean(hidden) }).eq("id", examId).select("id"), "숨김을 못 적음") ?? [];
  if (!r.length) throw new Error("회차가 없습니다");
  return syncStops(sb, examId, date);
}
/** (저) 「봤음」 — 나이스가 옮긴 기간을 원장님이 봤다(0152 changed_seen_at · 확정-69). 대시보드·06b 꼬리표가 내려간다 · 이전 기간은 남는다 */
export async function setChangeSeen(sb, examId) {
  const r = changed(await db(sb).from("exams").update({ changed_seen_at: new Date().toISOString() }).eq("id", examId).is("changed_seen_at", null).select("id"), "봤음을 못 적음") ?? [];
  if (!r.length) throw new Error("회차가 없거나 이미 봤습니다");
  return { seen: r.length };
}
/** 몇 주 전부터(학교급) — 규칙 줄을 고친다(뼈대-5). 바뀌면 앞으로의 회차 멈춤을 다시 맞춘다 */
export async function setStopWeeks(sb, level, weeks, date) {
  if (!LEVELS.includes(level)) throw new Error(`학교급이 아닙니다: ${level}`);
  const n = Number(weeks); if (!Number.isInteger(n) || n < 0 || n > 12) throw new Error(`주 수가 이상합니다: ${weeks}`);
  const r = changed(await db(sb).from("rule").update({ value: String(n) }).eq("key", `prep.stop_weeks.${level}`).select("key"), "규칙을 못 고침", { zero: "ok" }) ?? [];
  if (!r.length) throw new Error(`규칙 줄이 없다: prep.stop_weeks.${level} — 0122 의 씨앗을 본다`);
  return syncAllStops(sb, date);
}
/** 이 아이만 따로 — 비우면 학교급 기본값 */
export async function setStudentWeeks(sb, studentId, weeks, date) {
  const n = weeks == null || weeks === "" ? null : Number(weeks);
  if (n != null && (!Number.isInteger(n) || n < 0 || n > 12)) throw new Error(`주 수가 이상합니다: ${weeks}`);
  const r = changed(await db(sb).from("students").update({ stop_weeks: n }).eq("id", studentId).select("id"), "아이의 주 수를 못 적음") ?? [];
  if (!r.length) throw new Error("재원생이 아닙니다");
  return syncAllStops(sb, date);
}
/** 교재 멈춤을 회차에 맞춘다 — 보는 아이의 살아 있는 배정 교재(내신 교재 빼고)를 「영어 시험일 − N주 ~ 시험 끝」으로 book_off.
 *  건드리는 줄: 돌아가는 줄(묶인 데 없음) · 이 회차에 묶인 줄 · 기한이 지난 줄. 손으로 멈춘 줄과 「풀기」로 푼 줄(stop_exam_id 는 남고 running)은 안 건드린다 — force(지금 멈춤)면 푼 줄도 다시.
 *  영어일이 없거나 숨겼거나 물린 회차면 묶인 줄을 전부 푼다 */
export async function syncStops(sb, examId, date, { from = null, force = false } = {}) {
  if (!isDate(date)) throw new Error(`날짜가 아닙니다: ${date}`);
  const e = row(await db(sb).from("exams").select("id,scope,school_id,grade,name,term_from,term_to,english_on,state,hidden,schools(level)").eq("id", examId).maybeSingle(), "회차를 못 읽음");
  if (!e) throw new Error("회차가 없습니다");
  const bound = row(await db(sb).from("student_book").select("id,student_id,stop_mode").eq("stop_exam_id", examId), "묶인 교재를 못 읽음") ?? [];
  const release = async (ids) => { if (!ids.length) return 0; changed(await db(sb).from("student_book").update({ stop_mode: "running", stop_exam_id: null, stop_from: null, stop_until: null }).in("id", ids).select("id"), "멈춤을 못 풂", { zero: "ok" }); return ids.length; };
  if (e.state !== "active" || e.hidden || !e.english_on) return { bound: 0, kept: 0, released: await release(bound.map((b) => b.id)), why: e.state !== "active" ? "물린 회차" : e.hidden ? "숨긴 회차" : "영어 시험일 없음" };
  const ids = (row(await db(sb).rpc("exam_takers", { p_exam: examId }), "보는 아이를 못 읽음") ?? []).map((t) => t.student_id);
  const rules = await ruleMap(sb, ["prep.stop_weeks."]);
  const students = ids.length ? row(await db(sb).from("students").select("id,stop_weeks,schools(level)").in("id", ids), "아이를 못 읽음") ?? [] : [];
  const books = ids.length ? row(await alive(db(sb).from("student_book").select("id,student_id,book_id,stop_mode,stop_from,stop_until,stop_exam_id,books!inner(area,state)"), date).in("student_id", ids), "배정 교재를 못 읽음") ?? [] : [];
  let n = 0; const keep = new Set();
  for (const b of books) {
    if (b.books?.area === "내신") continue;   // 내신 교재는 시험철에 돈다
    const st = students.find((s) => s.id === b.student_id), level = st?.schools?.level ?? e.schools?.level;
    const win = stopWindow(e, weeksFor(level, rules, st)); if (!win) continue;   // 규칙 줄이 없으면 안 세운다(화면이 말한다)
    const mine = b.stop_exam_id === examId, expired = b.stop_until && String(b.stop_until) < String(date);
    const eligible = (b.stop_mode === "running" && (!b.stop_exam_id || force)) || (mine && b.stop_mode !== "running") || (mine && force) || expired;
    if (!eligible) continue;   // 원장님이 손으로 멈춘 것 · 다른 회차에 묶인 것은 안 건드린다
    const patch = { stop_mode: "book_off", stop_exam_id: examId, stop_from: from ?? win.from, stop_until: win.until };
    keep.add(b.id);
    if (b.stop_mode === patch.stop_mode && mine && String(b.stop_from ?? "") === patch.stop_from && String(b.stop_until ?? "") === patch.stop_until) continue;
    changed(await db(sb).from("student_book").update(patch).eq("id", b.id).select("id"), "멈춤을 못 맞춤"); n++;
  }
  const released = await release(bound.filter((b) => !keep.has(b.id) && b.stop_mode !== "running").map((b) => b.id));
  return { bound: n, kept: keep.size, released, why: null };
}
/** 지금 바로 멈추기 — 날짜와 상관없이 오늘부터(풀어 둔 줄도 다시) */
export const stopNow = (sb, examId, date) => syncStops(sb, examId, date, { from: date, force: true });
/** 풀기 — 이 회차에 묶인 줄을 돌아가게. stop_exam_id 는 남겨 「손으로 풀었다」를 기억한다(다음 맞추기가 다시 멈추지 않게 · 지금 멈춤은 다시 멈춘다) */
export async function releaseStops(sb, examId) {
  const r = changed(await db(sb).from("student_book").update({ stop_mode: "running", stop_from: null, stop_until: null }).eq("stop_exam_id", examId).neq("stop_mode", "running").select("id"), "멈춤을 못 풂", { zero: "ok" }) ?? [];
  return { released: r.length };
}
/** 앞으로의 회차 전부 다시 맞추기 — 규칙·아이 주 수가 바뀌었을 때 · 받아온 뒤(기간이 바뀌었을 수 있다) */
export async function syncAllStops(sb, date) {
  const exams = row(await db(sb).from("exams").select("id,term_from,term_to,english_on").eq("state", "active").eq("hidden", false).not("english_on", "is", null), "회차를 못 읽음") ?? [];
  let bound = 0, released = 0, n = 0;
  for (const e of exams) { if (examEnd(e) && examEnd(e) < date) continue; const r = await syncStops(sb, e.id, date); bound += r.bound; released += r.released; n++; }
  return { exams: n, bound, released };
}
/** (저) 크론 한 바퀴 앞 — 앞으로의 회차 멈춤을 다시 맞춘다(새로 이은 교재 · 학교·학년이 바뀐 아이 · 끝난 창 풀기 — 06b 남긴 것 · 뼈대-9: 새 셈이 아니라 같은 손 syncAllStops).
 *  서버 자신(auth.uid() 없음)도 exam_takers 를 읽는다(0152) — 못 읽으면 보는 아이가 0 이라 묶인 교재를 다 풀어 버린다 */
export async function syncStopsDaily(sb, today) { await syncAllStops(sb, today); }
if (!beforeRun.includes(syncStopsDaily)) beforeRun.push(syncStopsDaily);
