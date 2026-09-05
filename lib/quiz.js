/** 시험(v2.quiz) 한 벌 — 낸 날과 본 날이 다르다(0038, 원장님 9/2): 숙제 낼 때 「다음 시간 시험」 범위를 정해 같이 내보내고, 다음 수업에 본다.
 *  판정(통과·맞은 개수·%)은 SQL 한 곳(v2.quiz_passed → 계산 칸 passed·pct) — 여기서 다시 세지 않는다. 원장님은 틀린 개수만 적는다(0039).
 *  통과선·방식은 학생 × 교재 × 회독마다 한 곳(v2.style_for: 아이 것 → 교재 것 → 학원 기본값). 미통과면 재시험 줄(retry_of · 더 어렵게)이 서고 늦귀가 사유에 붙는다(목업 01 노트).
 *  「오늘은 재시험 건너뜀」은 재시험 줄만 skipped 로 — 점수는 그대로, 오늘만 빠진다(9/5 ②). 교재멈춤이면 시험도 못 낸다(DB quiz_guard). */
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { tagReason } from "./late.js";
import { KIND, SOURCE, splitQuizzes, scopeText, retestTag } from "./quiz-plan.js";
export { KIND, SOURCE, splitQuizzes, scopeText };
const SEL = "id,student_id,kind,source,assigned_sheet_id,assigned_on,book_id,unit_from,free_note,total,cut_pct,taken_sheet_id,taken_on,wrong,retry_of,state,style_id,harder,passed,pct,books(name),units!unit_from(id,chapter,short,label),quiz_style(id,round,cut_pct,text)";
/** 오늘 화면이 읽는 시험 — 안 본 것(planned) · 오늘 본 것 · 오늘 낸 재시험(건너뜀 포함). 한 조회 */
export async function quizzesOf(sb, studentIds, date) {
  if (!studentIds.length) return [];
  const { data, error } = await db(sb).from("quiz").select(SEL).in("student_id", studentIds)
    .or(`state.eq.planned,taken_on.eq.${date},and(state.eq.skipped,assigned_on.eq.${date})`).order("assigned_on").order("created_at");
  if (error) throw new Error(`시험을 못 읽음: ${error.message}`);
  return data ?? [];
}
async function sheetRow(sb, sheetId) {
  await assertOpen(sb, sheetId);
  const { data, error } = await db(sb).from("day_sheet").select("id,student_id,date").eq("id", sheetId).single();
  if (error || !data) throw new Error(`판을 못 읽음: ${error?.message ?? "없음"}`);
  return data;
}
async function styleFor(sb, studentId, bookId, round, kind) {
  const { data, error } = await db(sb).rpc("style_for", { p_student: studentId, p_book: bookId, p_round: round, p_kind: kind });
  if (error) throw new Error(`시험 방식을 못 읽음: ${error.message}`);
  const s = Array.isArray(data) ? data[0] : data;
  return s?.id ? s : null;   // 짝이 없으면 칸이 전부 NULL 인 줄 하나가 온다(옛 검사가 잡은 함정)
}
/** 다음 시간 시험 내기 — 오늘 숙제와 같이 나간다. 범위는 교재(오늘 학습 소단원)거나 직접 적은 글 */
export async function addQuiz(sb, sheetId, { kind, bookId = null, unitId = null, freeNote = null, round = 1 }) {
  if (!KIND.some(([k]) => k === kind)) throw new Error(`시험 갈래가 아닙니다: ${kind}`);
  const sheet = await sheetRow(sb, sheetId);
  const source = bookId ? "book" : "manual";
  if (source === "manual" && !String(freeNote ?? "").trim()) throw new Error("범위를 적으세요 — 교재를 고르거나 직접 적습니다");
  const style = await styleFor(sb, sheet.student_id, bookId, round, kind);
  const row = { student_id: sheet.student_id, kind, source, book_id: bookId, unit_from: unitId, free_note: source === "manual" ? String(freeNote).trim() : null,
    assigned_sheet_id: sheetId, assigned_on: sheet.date, cut_pct: style?.cut_pct ?? 90, style_id: style?.id ?? null, state: "planned" };
  const { data, error } = await db(sb).from("quiz").insert(row).select("id").single();
  if (error) throw new Error(`시험을 못 냄: ${error.message}`);
  return { id: data.id };
}
/** 낸 시험 고치기 — 전체 개수 · 통과선 · 범위(직접). 낸 것(planned)만 */
export async function setQuiz(sb, sheetId, quizId, { total, cutPct, source, freeNote }) {
  await assertOpen(sb, sheetId);
  const patch = {};
  if (total !== undefined) { const n = num(total); if (n !== null && n <= 0) throw new Error("전체 개수는 1 이상"); patch.total = n; }
  if (cutPct !== undefined) { const n = num(cutPct); if (n === null || n < 0 || n > 100) throw new Error("통과선은 0~100"); patch.cut_pct = n; }
  if (source !== undefined) { if (source === "prep") throw new Error("내신 범위는 시험 화면을 지을 때 — 지금은 교재·직접"); if (!SOURCE.some(([k]) => k === source)) throw new Error(`범위 갈래가 아닙니다: ${source}`); patch.source = source; if (source === "manual") { patch.book_id = null; patch.unit_from = null; patch.free_note = String(freeNote ?? "").trim() || "(범위)"; } }
  else if (freeNote !== undefined) patch.free_note = String(freeNote ?? "").trim() || null;
  const { data, error } = await db(sb).from("quiz").update(patch).eq("id", quizId).eq("state", "planned").select("id");
  if (error) throw new Error(`시험을 못 고침: ${error.message}`);
  if (!data?.length) throw new Error("낸 시험이 아니거나 이미 봤습니다");   // 0줄이면 실패(검사-⑪)
}
const num = (v) => { const s = String(v ?? "").trim(); if (!s) return null; const n = Number(s); if (!Number.isInteger(n) || n < 0) throw new Error(`숫자가 아닙니다: ${s}`); return n; };
/** 시험 보기 — 틀린 개수(·전체)를 적으면 통과·맞은 개수·%는 세어 나온다. 미통과면 재시험 줄 + 늦귀가 사유, 통과면 둘 다 걷는다 */
export async function takeQuiz(sb, sheetId, quizId, { wrong, total }) {
  const sheet = await sheetRow(sb, sheetId);
  const w = num(wrong), t = total === undefined ? undefined : num(total);
  const patch = { wrong: w, taken_sheet_id: sheetId, taken_on: sheet.date };
  if (t !== undefined) patch.total = t;
  const { error } = await db(sb).from("quiz").update(patch).eq("id", quizId);
  if (error) throw new Error(`시험 결과를 못 씀: ${error.message}`);
  const { data: q, error: e2 } = await db(sb).from("quiz").select(SEL).eq("id", quizId).single();
  if (e2 || !q) throw new Error(`시험을 못 읽음: ${e2?.message ?? "없음"}`);
  if (q.total != null && w != null && w > q.total) throw new Error("틀린 개수가 전체보다 많습니다");
  const state = q.passed === true ? "passed" : q.passed === false ? "failed" : "taken";   // 판정은 SQL(passed)
  if (state !== q.state) { const { error: e3 } = await db(sb).from("quiz").update({ state }).eq("id", quizId); if (e3) throw new Error(`시험 상태를 못 씀: ${e3.message}`); }
  if (state === "failed") await ensureRetest(sb, sheet, { ...q, state });
  if (state === "passed") await dropRetest(sb, sheet, q);
  return { state, pct: q.pct };
}
const tagOf = retestTag;
/** 재시험 줄 — 못 넘긴 시험을 가리키고(retry_of) 더 어렵게(harder · 다음 회독 방식). 오늘 낸 것으로 선다(그날 남아서 본다, 9/5 ⑪). 이미 있으면 그대로 */
async function ensureRetest(sb, sheet, q) {
  const { data: have } = await db(sb).from("quiz").select("id,state").eq("retry_of", q.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!have) {
    const round = (q.quiz_style?.round ?? 1) + 1;
    const style = (await styleFor(sb, sheet.student_id, q.book_id, round, q.kind)) ?? (await styleFor(sb, sheet.student_id, q.book_id, q.quiz_style?.round ?? 1, q.kind));
    const row = { student_id: sheet.student_id, kind: q.kind, source: q.source, book_id: q.book_id, unit_from: q.unit_from, free_note: q.free_note,
      assigned_sheet_id: sheet.id, assigned_on: sheet.date, total: q.total, cut_pct: q.cut_pct, style_id: style?.id ?? q.style_id, retry_of: q.id, harder: true, state: "planned" };
    const { error } = await db(sb).from("quiz").insert(row); if (error) throw new Error(`재시험 줄을 못 세움: ${error.message}`);
  } else if (have.state !== "planned" && have.state !== "skipped") return;
  if (!have || have.state === "planned") await tagReason(sb, sheet.id, tagOf(q), true);
}
async function dropRetest(sb, sheet, q) {
  const { data: have } = await db(sb).from("quiz").select("id,state").eq("retry_of", q.id).in("state", ["planned", "skipped"]);
  await Promise.all((have ?? []).map((r) => db(sb).from("quiz").update({ state: "skipped" }).eq("id", r.id)));
  await tagReason(sb, sheet.id, tagOf(q), false);
}
/** 「📄 재시험지 만들기」 — 재시험 줄을 세운다(있으면 그대로). 시험지(종이)는 할 일 05 를 지을 때 */
export async function retest(sb, sheetId, quizId) {
  const sheet = await sheetRow(sb, sheetId);
  const { data: q, error } = await db(sb).from("quiz").select(SEL).eq("id", quizId).single();
  if (error || !q) throw new Error(`시험을 못 읽음: ${error?.message ?? "없음"}`);
  if (q.passed !== false) throw new Error("못 넘긴 시험만 재시험을 만듭니다");
  await ensureRetest(sb, sheet, q);
}
/** 「⏭ 오늘은 재시험 건너뜀」 — 재시험 줄만 skipped/planned. 점수는 그대로, 늦귀가 사유에서 오늘만 빠진다 */
export async function skipRetest(sb, sheetId, quizId, skip) {
  const sheet = await sheetRow(sb, sheetId);
  const { data: q, error } = await db(sb).from("quiz").select(SEL).eq("id", quizId).single();
  if (error || !q) throw new Error(`시험을 못 읽음: ${error?.message ?? "없음"}`);
  const { data, error: e2 } = await db(sb).from("quiz").update({ state: skip ? "skipped" : "planned" }).eq("retry_of", quizId).in("state", ["planned", "skipped"]).select("id");
  if (e2) throw new Error(`재시험을 못 바꿈: ${e2.message}`);
  if (!data?.length) throw new Error("재시험 줄이 없습니다 — 먼저 재시험지 만들기");
  await tagReason(sb, sheet.id, tagOf(q), !skip);
}
