/** 성적 16 의 손 — 판 읽기(한 벌 score_board) · 등급컷(회차) · 문항표(회차 · 한 곳 set_exam_questions) · 넣기(원장 대신 · 아이가 제 것) · 틀린 번호(한 곳 set_score_wrong) · 확인(굳고 공개 기본값이 붙는다) · 공개 바꾸기 · 엑셀 올리기(이름으로).
 *  등급·영역 셈은 lib/score-plan.js(순수) — 저장하지 않는다(대전제-5). 지우지 않는다(대전제-6) */
import { db } from "./supabase.js";
import { myStudent } from "./arrival.js";
import { takes } from "./exam-plan.js";
import { parseCuts, parseQuestions, parseWrong, SHOW, rowsOf, parsePercentile } from "./score-plan.js";
import { notify } from "./notify.js";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
const isShow = (s) => SHOW.some(([k]) => k === s);
export async function scoreBoard(sb, examId, date) {
  const { data, error } = await db(sb).rpc("score_board", { p_exam: examId || null, p_on: date });
  if (error) throw new Error(`성적 판을 못 읽음: ${error.message}`);
  if (!data) throw new Error("성적은 학원 사람의 화면입니다");
  return data;
}
/** 회차의 등급컷 — 「90, 84, 77」. 비우면 없앤다(중학교는 절대평가로 센다) */
export async function setCuts(sb, examId, text) {
  const cuts = parseCuts(text);
  const r = row(await db(sb).from("exams").update({ cuts: cuts.length ? cuts : null }).eq("id", examId).select("id"), "등급컷을 못 적음") ?? [];
  if (!r.length) throw new Error("회차가 없습니다");
  return cuts;
}
/** 회차의 문항표 — 「1-5 듣기, 6-20 독해 …」 통째로 */
export async function setQuestions(sb, examId, text) {
  const rows = parseQuestions(text);
  const n = row(await db(sb).rpc("set_exam_questions", { p_exam: examId, p_rows: rows }), "문항표를 못 적음");
  return { rows: rows.length, saved: Number(n ?? 0) };
}
async function examOf(sb, examId) {
  const e = row(await db(sb).from("exams").select("id,scope,school_id,grade,name,term_from,term_to,english_on,state,hidden,schools(level)").eq("id", examId).maybeSingle(), "회차를 못 읽음");
  if (!e || e.state !== "active") throw new Error("회차가 없거나 물렸습니다");
  return e;
}
/** 성적 한 줄 — 있으면 고치고 없으면 넣는다(학생 × 회차에 하나). 아이는 제 것 · 확인 전 · 아이가 넣은 것만 고친다(RLS 도 그렇다) */
export async function saveScore(sb, { examId, studentId, raw, full = 100, wrongs = "", note = null, byWho = "staff", showTo = null, percentile }, date) {
  if (!examId || !studentId) throw new Error("회차와 아이가 있어야 합니다");
  const f = Number(full ?? 100), n = raw == null || raw === "" ? null : Number(raw);
  if (!Number.isInteger(f) || f <= 0) throw new Error(`만점이 이상합니다: ${full}`);
  if (n == null || !Number.isFinite(n) || n < 0 || n > f) throw new Error(`원점수가 이상합니다: ${raw}(만점 ${f})`);
  const e = await examOf(sb, examId);
  const ex = row(await db(sb).from("score").select("id,by_who,confirmed").eq("exam_id", examId).eq("student_id", studentId).order("created_at").limit(1).maybeSingle(), "성적을 못 읽음");
  if (ex && byWho === "student" && (ex.confirmed || ex.by_who !== "student")) throw new Error("원장님이 넣었거나 이미 확인한 성적은 못 고칩니다");
  const patch = { raw: n, full_score: f, taken_on: e.english_on ?? e.term_from ?? date, note: note ?? null, ...(percentile === undefined ? {} : { percentile: e.scope === "national" ? parsePercentile(percentile) : null }) };   // 백분위는 모의고사만(4단계-4)
  let id = ex?.id ?? null;
  if (id) row(await db(sb).from("score").update(patch).eq("id", id).select("id"), "성적을 못 고침");
  else id = row(await db(sb).from("score").insert({ student_id: studentId, exam_id: examId, kind: e.scope === "national" ? "mock" : "school", subject: "영어", by_who: byWho, confirmed: false, show_to: showTo ?? (byWho === "student" ? "student" : "staff"), ...patch }).select("id").single(), "성적을 못 넣음").id;
  const qs = parseWrong(wrongs);
  const wn = row(await db(sb).rpc("set_score_wrong", { p_score: id, p_qs: qs }), "틀린 문항을 못 적음");
  return { id, wrongs: Number(wn ?? 0), fresh: !ex };
}
/** 확인 — 성적이 굳고, 공개는 아이의 기본값(students.score_show)이 붙는다(줄마다 따로 주면 그것) */
export async function confirmScore(sb, scoreId, showTo = null) {
  const s = row(await db(sb).from("score").select("id,student_id,confirmed,students(score_show)").eq("id", scoreId).maybeSingle(), "성적을 못 읽음");
  if (!s) throw new Error("성적 줄이 없습니다");
  const show = showTo && isShow(showTo) ? showTo : (s.students?.score_show ?? "both");
  row(await db(sb).from("score").update({ confirmed: true, show_to: show }).eq("id", scoreId).select("id"), "확인을 못 적음");
  return { show };
}
/** 확인 풀기(4단계-4 — 확인 뒤 고칠 일이 생겼을 때) — 확인만 풀고 줄은 그대로 · 공개는 원장만으로 되돌린다(학부모가 보던 숫자가 고쳐지는 동안 안 보이게) */
export async function unconfirmScore(sb, scoreId) {
  const r = row(await db(sb).from("score").update({ confirmed: false, show_to: "staff" }).eq("id", scoreId).eq("confirmed", true).select("id"), "확인을 못 풂");
  if (!r?.length) throw new Error("확인한 성적이 아닙니다");
}
/** 모두 확인 — 이 회차에서 아직 확인 안 한 줄 전부 */
export async function confirmAll(sb, examId) {
  const list = row(await db(sb).from("score").select("id").eq("exam_id", examId).eq("confirmed", false), "성적을 못 읽음") ?? [];
  for (const s of list) await confirmScore(sb, s.id);
  return { n: list.length };
}
/** 공개 바꾸기 — 확인한 줄만(확인해야 공개를 켤 수 있다, 목업 16) */
export async function setShow(sb, scoreId, showTo) {
  if (!isShow(showTo)) throw new Error(`공개 값이 아닙니다: ${showTo}`);
  const r = row(await db(sb).from("score").update({ show_to: showTo }).eq("id", scoreId).eq("confirmed", true).select("id"), "공개를 못 바꿈") ?? [];
  if (!r.length) throw new Error("확인한 성적만 공개를 바꿀 수 있습니다");
}
/** 아이가 제 성적을 넣는다(07) — 제 회차(학교·학년 · 안 봄 뺌)만 · 확인 전엔 다시 넣어 고칠 수 있다 */
export async function studentSubmit(sb, user, { examId, raw, full, wrongs }, date) {
  const st = await myStudent(sb, user.id);
  const e = row(await db(sb).from("exams").select("id,scope,school_id,grade,name,term_from,term_to,english_on,state,hidden,exam_skip(student_id,skipped)").eq("id", examId).maybeSingle(), "회차를 못 읽음");
  if (!e || !takes({ ...st, level: st.schools?.level }, e)) throw new Error("내 시험 회차가 아닙니다");
  return saveScore(sb, { examId, studentId: st.id, raw, full, wrongs, byWho: "student", showTo: "student" }, date);
}
/** 엑셀 — 이름으로 보는 아이에 맞춰 넣고 바로 확인(원장님이 올린 것이니까). 같은 이름 둘이면 못 맞춘다 */
export async function importScores(sb, examId, parsed = [], board, date) {
  const takers = board?.takers ?? [], unmatched = [], dup = []; let put = 0;
  for (const r of parsed) {
    const hits = takers.filter((t) => t.name.replace(/\s/g, "") === r.name.replace(/\s/g, ""));
    if (hits.length !== 1) { (hits.length ? dup : unmatched).push(r.name); continue; }
    const { id } = await saveScore(sb, { examId, studentId: hits[0].id, raw: r.raw, full: r.full ?? 100, wrongs: (r.wrongs ?? []).join(","), note: r.note ?? null, byWho: "staff" }, date);
    if (r.grade != null) row(await db(sb).from("score").update({ grade: r.grade }).eq("id", id).select("id"), "등급을 못 적음");   // 학교가 발표한 등급은 컷보다 이긴다
    await confirmScore(sb, id); put++;
  }
  return { put, unmatched: [...new Set(unmatched)], dup: [...new Set(dup)] };
}
/** 아이의 성적 공개 기본값(students.score_show — 14 「성적 공개」) — 확인하는 순간 줄의 공개가 이 값으로 붙는다(0123) */
export async function setStudentShow(sb, studentId, show) {
  if (!SHOW.some(([k]) => k === show)) throw new Error(`공개 값이 아닙니다: ${show}`);
  const { data, error } = await db(sb).from("students").update({ score_show: show }).eq("id", studentId).select("id");
  if (error) throw new Error(`성적 공개를 못 바꿈: ${error.message}`); if (!data?.length) throw new Error("고쳐진 줄이 없습니다");
}

/** 📨 안 낸 아이 재촉(16 · 4단계-2a) — 보는 아이 중 성적 줄이 없는 아이에게. 아이가 넣는 것이라 아이 기기도(who=all) · 알림 길은 lib/notify 하나 · 자취 why 는 회차 */
export async function remindScores(svc, sb, examId, date) {
  const b = await scoreBoard(sb, examId, date); if (!b?.exam) throw new Error("회차가 없습니다");
  const targets = rowsOf(b).filter((r) => r.state === "none");
  let sent = 0, failed = 0, sink = null;
  for (const r of targets) { const x = await notify(svc, { kind: "score", studentId: r.student_id, url: "/me#scores", tag: `score-${examId}-${r.student_id}`, why: { table: "exams", id: examId }, who: "all" }); sink = x.sink; sent += x.sent; failed += x.failed; }
  return { n: targets.length, sent, failed, sink };
}
