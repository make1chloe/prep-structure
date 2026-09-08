/** 신규 상담 18 의 손 — 판 읽기(한 벌 inquiry_board) · + 전화 문의 · 고치기(방문 · 레벨 · 점수 · 제안 · 사유) · 안내 보냄(답한 때) · 단계 · 등록 전환 일곱(학생 등록 · 계정 둘 · 반 · 교재 · 루틴(저절로) · 결제선생 할 일 · 첫 등원 안내).
 *  판단은 lib/inquiry-plan.js(순수). 지우지 않는다 — 안 옴은 dropped */
import { db, serviceClient } from "./supabase.js";
import { parseInquiry, parseConvert, matchSchool, STAGES } from "./inquiry-plan.js";
import { addStudent, setClass, issueStudentAccount, issueParentAccount } from "./student.js";
import { assignBook } from "./routine.js";
import { addTodo } from "./schedule.js";
import { notify } from "./notify.js";
import { changed, row } from "./sqlError.js";
export async function inquiryBoard(sb, date) {
  const { data, error } = await db(sb).rpc("inquiry_board", { p_on: date });
  if (error) throw new Error(`신규 상담을 못 읽음: ${error.message}`);
  if (!data) throw new Error("신규 상담은 학원 사람의 화면입니다");
  return data;
}
/** + 전화 문의 받기 — 전화 끊고 바로. 이름 · 학부모 전화 · 학교 · 학년 · 갈래 · 물음 */
export async function addInquiry(sb, f) {
  const p = parseInquiry(f);
  const ins = row(await db(sb).from("inquiry").insert({ ...p, stage: "new" }).select("id").single(), "문의를 못 넣음");
  return ins.id;
}
const isTs = (t) => !t || !Number.isNaN(new Date(t).getTime());
/** 고치기 — 방문 · 레벨 때 · 점수 · 제안 · 사유 · 물음. 방문을 잡으면 「상담 잡힘」, 점수를 적으면 「레벨 봄」으로 단계가 따라간다(원장님이 따로 안 옮겨도) */
export const STALE = "다른 사람이 먼저 고쳤습니다 — 새로고침 뒤 다시 적어 주세요";   // 0-3
export async function setInquiry(sb, id, f = {}, seenAt = null) {
  const patch = {};
  if ("visitAt" in f) { if (!isTs(f.visitAt)) throw new Error("방문 때가 아닙니다"); patch.visit_at = f.visitAt || null; }
  if ("testAt" in f) { if (!isTs(f.testAt)) throw new Error("레벨 때가 아닙니다"); patch.test_at = f.testAt || null; }
  if ("levelNote" in f) patch.level_note = String(f.levelNote ?? "").trim() || null;
  if ("suggest" in f) patch.suggest = String(f.suggest ?? "").trim() || null;
  if ("why" in f) patch.why = String(f.why ?? "").trim() || null;
  if ("body" in f) patch.body = String(f.body ?? "").trim() || null;
  const cur = row(await db(sb).from("inquiry").select("id,stage").eq("id", id).single(), "문의를 못 읽음"); if (!cur) throw new Error("문의가 없습니다");
  if (cur.stage === "new" && patch.visit_at) patch.stage = "visit";
  if (["new", "visit"].includes(cur.stage) && patch.level_note) patch.stage = "test";
  if (!Object.keys(patch).length) throw new Error("바꿀 것이 없습니다");
  let q = db(sb).from("inquiry").update(patch).eq("id", id); if (seenAt) q = q.eq("updated_at", seenAt);
  const r = row(await q.select("id"), "문의를 못 고침"); if (!r?.length) throw new Error(seenAt ? STALE : "고쳐진 줄이 없습니다");
  return { stage: patch.stage ?? cur.stage };
}
/** 📨 안내 보냄 — 답한 때를 찍는다(문자는 아직 — 안내 글은 화면이 복사한다) */
export async function answerInquiry(sb, id) { changed(await db(sb).from("inquiry").update({ answered_at: new Date().toISOString() }).eq("id", id).select("id"), "답한 때를 못 적음"); }
export async function setStage(sb, id, stage, why = null) {
  if (!STAGES.some(([k]) => k === stage)) throw new Error(`단계가 아닙니다: ${stage}`);
  if (stage === "joined") throw new Error("등록은 「등록 전환」으로");
  const patch = { stage }; if (stage === "dropped") patch.why = String(why ?? "").trim() || null;
  changed(await db(sb).from("inquiry").update(patch).eq("id", id).select("id"), "단계를 못 바꿈");
}
/** ✅ 등록 전환 — 한 번 누르면 일곱이 저절로. 하나가 막히면 거기까지 한 것과 막힌 까닭을 돌려준다(반쯤 된 채로 두지 않으려면 학생 줄은 마지막에 확인) */
export async function convertInquiry(sb, id, f, { date, by = null, schools = [] } = {}) {
  const p = parseConvert(f);
  const q = row(await db(sb).from("inquiry").select("*").eq("id", id).single(), "문의를 못 읽음"); if (!q) throw new Error("문의가 없습니다");
  if (q.student_id || q.stage === "joined") throw new Error("이미 등록한 문의입니다");
  const svc = serviceClient();
  const steps = [];
  const school = matchSchool(q.school, schools);
  const studentId = await addStudent(sb, { name: q.name, grade: q.grade, schoolId: school?.id ?? null, phone: q.student_phone, parentPhone: q.phone, memo: [q.way ? `유입: ${q.way}` : null, q.body ? `물음: ${q.body}` : null, q.level_note ? `레벨: ${q.level_note}` : null, q.suggest ? `제안: ${q.suggest}` : null].filter(Boolean).join("\n") || null, joinedOn: p.joinedOn ?? date }, date);
  steps.push({ key: "student", ok: true, text: `${q.name} — 학생 줄${school ? ` · ${school.name}` : q.school ? ` · 학교 「${q.school}」은 목록에 없어 메모에만` : ""}` });
  try { const a = await issueStudentAccount(svc, sb, studentId, p.loginId); steps.push({ key: "accounts", ok: true, text: `학생 ${a.login_id} · 첫 비밀번호 ${a.password}` }); }
  catch (e) { steps.push({ key: "accounts", ok: false, text: String(e.message) }); }
  try { const pa = await issueParentAccount(svc, sb, studentId, q.phone, null); steps[steps.length - 1].text += ` / 학부모 ${pa.login_id}${pa.created ? ` · 첫 비밀번호 ${pa.password}` : " · 있던 계정에 이음(형제)"}`; }
  catch (e) { steps[steps.length - 1] = { ...steps[steps.length - 1], ok: false, text: `${steps[steps.length - 1].text} / 학부모: ${e.message}` }; }
  try { await setClass(sb, studentId, p.classId, p.joinedOn ?? date); steps.push({ key: "class", ok: true, text: `반 — ${p.joinedOn ?? date} 부터` }); } catch (e) { steps.push({ key: "class", ok: false, text: String(e.message) }); }
  let books = 0; for (const b of p.bookIds) { try { await assignBook(sb, studentId, b, p.joinedOn ?? date); books++; } catch (e) { steps.push({ key: "books", ok: false, text: String(e.message) }); } }
  if (!steps.some((s) => s.key === "books")) steps.push({ key: "books", ok: true, text: books ? `교재 ${books}권 — 기준·회차는 루틴 11 에서` : "교재는 나중에(루틴 11 에서 잇기)" });
  steps.push({ key: "routine", ok: true, text: "영역 루틴이 저절로 — 짤 것이 없습니다" });
  try { await addTodo(sb, { title: `결제선생 등록 — ${q.name}`, dueOn: p.joinedOn ?? date, studentId }); steps.push({ key: "fee", ok: true, text: "할 일에 카드로 섰습니다" }); } catch (e) { steps.push({ key: "fee", ok: false, text: String(e.message) }); }
  try { const r = await notify(svc, { kind: "welcome", studentId, url: "/parent", tag: `welcome-${studentId}`, why: { table: "inquiry", id } }); steps.push({ key: "welcome", ok: r.failed === 0, text: r.failed ? `학부모 계정으로 보낼 자리에 기기가 없습니다(${r.why ?? "닿는 기기 없음"}) — 🔔 알림 켜기 뒤에` : "학부모 계정으로 나갔습니다(문자는 아직)" }); }
  catch (e) { steps.push({ key: "welcome", ok: false, text: String(e.message) }); }
  changed(await db(sb).from("inquiry").update({ stage: "joined", student_id: studentId }).eq("id", id).select("id"), "문의를 못 고침");
  return { studentId, steps, done: steps.filter((s) => s.ok).length };
}
