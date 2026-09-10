/** 신규 상담 18 의 손 — 판 읽기(한 벌 inquiry_board) · + 전화 문의 · 고치기(방문 · 레벨 · 점수 · 제안 · 사유) · 안내 보냄(답한 때) · 단계 · 등록 전환 일곱(학생 등록 · 계정 둘 · 반 · 교재 · 루틴(저절로) · 결제선생 할 일 · 첫 등원 안내).
 *  판단은 lib/inquiry-plan.js(순수). 지우지 않는다 — 안 옴은 dropped */
import { db, serviceClient } from "./supabase.js";
import { parseInquiry, parseConvert, matchSchool, STAGES } from "./inquiry-plan.js";
import { addStudent, setClass, issueStudentAccount, issueParentAccount } from "./student.js";
import { assignBook } from "./routine.js";
import { addTodo } from "./schedule.js";
import { notify, sms, smsReady, smsTemplate, academyName } from "./notify.js";   // (커) 첫 등원 안내·상담 안내는 문자(솔라피 · 확정-71) — 길이 없으면 앱 알림·적기만
import { fill, phoneDigits, lenText } from "./sms-plan.js";
import { classText } from "./schedule-plan.js";
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
/** 📨 안내 — 답한 때를 찍고, 문자 길(연동 solapi)이 있으면 상담 안내 문자(msg_template sms_guide)를 학부모 전화로 보낸다((커) · 확정-71). 없으면 적기만(전화·카톡으로) */
export async function answerInquiry(sb, id) {
  const q = row(await db(sb).from("inquiry").select("id,name,phone").eq("id", id).single(), "문의를 못 읽음"); if (!q) throw new Error("문의가 없습니다");
  const svc = serviceClient();
  let out = null;
  if (await smsReady(svc) && phoneDigits(q.phone)) {
    const f = fill(await smsTemplate(svc, "sms_guide"), { 학원명: await academyName(svc), 이름: q.name });
    if (f.missing.length) throw new Error(`문구(sms_guide)의 치환 자리가 비었습니다: ${f.missing.join(", ")}`);
    out = await sms(svc, { kind: "guide", to: q.phone, text: f.text, url: "/", why: { table: "inquiry", id } });
  }
  changed(await db(sb).from("inquiry").update({ answered_at: new Date().toISOString() }).eq("id", id).select("id"), "답한 때를 못 적음");
  return { sms: out };
}
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
  let acc = null, par = null;   // (커) 첫 등원 안내 문자에 아이디·처음 비밀번호를 싣는다
  try { const a = await issueStudentAccount(svc, sb, studentId, p.loginId); acc = a; steps.push({ key: "accounts", ok: true, text: `학생 ${a.login_id} · 첫 비밀번호 ${a.password}` }); }
  catch (e) { steps.push({ key: "accounts", ok: false, text: String(e.message) }); }
  try { const pa = await issueParentAccount(svc, sb, studentId, q.phone, null); par = pa; steps[steps.length - 1].text += ` / 학부모 ${pa.login_id}${pa.created ? ` · 첫 비밀번호 ${pa.password}` : " · 있던 계정에 이음(형제)"}`; }
  catch (e) { steps[steps.length - 1] = { ...steps[steps.length - 1], ok: false, text: `${steps[steps.length - 1].text} / 학부모: ${e.message}` }; }
  try { await setClass(sb, studentId, p.classId, p.joinedOn ?? date); steps.push({ key: "class", ok: true, text: `반 — ${p.joinedOn ?? date} 부터` }); } catch (e) { steps.push({ key: "class", ok: false, text: String(e.message) }); }
  let books = 0; for (const b of p.bookIds) { try { await assignBook(sb, studentId, b, p.joinedOn ?? date); books++; } catch (e) { steps.push({ key: "books", ok: false, text: String(e.message) }); } }
  if (!steps.some((s) => s.key === "books")) steps.push({ key: "books", ok: true, text: books ? `교재 ${books}권 — 기준·회차는 루틴 11 에서` : "교재는 나중에(루틴 11 에서 잇기)" });
  steps.push({ key: "routine", ok: true, text: "영역 루틴이 저절로 — 짤 것이 없습니다" });
  try { await addTodo(sb, { title: `결제선생 등록 — ${q.name}`, dueOn: p.joinedOn ?? date, studentId }); steps.push({ key: "fee", ok: true, text: "할 일에 카드로 섰습니다" }); } catch (e) { steps.push({ key: "fee", ok: false, text: String(e.message) }); }
  try {   // (커) 첫 등원 안내 = 문자(솔라피 · 확정-71) — 앱 주소·아이디·처음 비밀번호·수업·교재·규정은 문구(msg_template sms_welcome · 원장님이 10 에서 고친다) · {{덧붙임}}은 이 아이만
    if (await smsReady(svc) && acc && par && phoneDigits(q.phone)) {
      const [clsQ, bksQ] = await Promise.all([
        db(sb).from("classes").select("nickname,kind,class_schedule(weekdays,start_time,to_date)").eq("id", p.classId).maybeSingle(),
        p.bookIds.length ? db(sb).from("books").select("name").in("id", p.bookIds) : Promise.resolve({ data: [] }),
      ]);
      const c = clsQ.data, sch = (c?.class_schedule ?? []).filter((s) => !s.to_date)[0] ?? {};
      const f = fill(await smsTemplate(svc, "sms_welcome"), {
        학원명: await academyName(svc), 학생명: q.name,
        학부모아이디: par.login_id, 학생아이디: acc.login_id,
        첫비밀번호: par.created ? acc.password : `${acc.password}(학부모는 쓰시던 비밀번호 그대로)`,
        반이름: c ? classText({ nickname: c.nickname, weekdays: sch.weekdays ?? [], start_time: sch.start_time }) : "",
        첫등원일: p.joinedOn ?? date,
        교재목록: (bksQ.data ?? []).map((x) => `· ${x.name}`).join("\n"),
        덧붙임: p.extra,
      });
      if (f.missing.length) throw new Error(`문구(첫 등원 안내)의 치환 자리가 비었습니다: ${f.missing.join(", ")} — 발송 10 「✉️ 문자 문구」에서 고치거나 값을 채워 주세요`);
      const pid = (row(await db(svc).from("profiles").select("id").eq("login_id", par.login_id).maybeSingle(), "학부모 계정을 못 읽음"))?.id ?? null;
      const r = await sms(svc, { kind: "welcome", to: q.phone, text: f.text, studentId, profileId: pid, why: { table: "inquiry", id } });
      steps.push({ key: "welcome", ok: r.failed === 0, text: r.sent ? `문자 보냄 ${r.to} · ${lenText(f.text).text}` : r.sink === "off" ? `문자 — 리허설(NOTIFY_SINK=off)이라 자취만 ${r.to}` : `문자 못 보냄 — ${r.why}` });
    } else {
      const r = await notify(svc, { kind: "welcome", studentId, url: "/parent", tag: `welcome-${studentId}`, why: { table: "inquiry", id } });
      steps.push({ key: "welcome", ok: r.failed === 0, text: `${acc && par ? (phoneDigits(q.phone) ? "문자 길(연동 solapi)이 없어" : "학부모 전화가 없어") : "계정이 없어"} 앱 알림으로 — ${r.failed ? `기기가 없습니다(${r.why ?? "닿는 기기 없음"}) — 🔔 알림 켜기 뒤에` : "학부모 계정으로 나갔습니다"}` });
    }
  }
  catch (e) { steps.push({ key: "welcome", ok: false, text: String(e.message) }); }
  changed(await db(sb).from("inquiry").update({ stage: "joined", student_id: studentId }).eq("id", id).select("id"), "문의를 못 고침");
  return { studentId, steps, done: steps.filter((s) => s.ok).length };
}
