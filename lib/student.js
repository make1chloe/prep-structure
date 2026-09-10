/** 학생 14 의 손 — 판 읽기(한 벌 student_board) · + 학생 · 고치기 · 퇴원·복귀(줄은 남는다) · 반 옮기기(이력) · 학생별 금액(fee_rule 이력) · 상담 적기 · 형제 묶기 · 계정 발급(학생 아이디 · 학부모 전화 — 첫 비밀번호 0000 · 바꿔야 들어감) · 학부모 계정 이름 고치기 · 비밀번호 초기화(앱이 발급한 계정만, 대전제-12).
 *  계정은 서버 자신(service role)이 auth 에 만든다 — 사람 자격으로는 못 만든다. 판단은 lib/student-plan.js(순수) · 아이디 꼴은 lib/roles toLoginEmail 한 곳 */
import { db } from "./supabase.js";
import { toLoginEmail } from "./roles.js";
import { parseStudent, parseLoginId, canReset, parseParentName } from "./student-plan.js";
import { changed, row } from "./sqlError.js";
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
export const FIRST_PW = "0000";   // 첫 비밀번호는 이것 하나(0032) — must_change_pw 가 켜져 첫 로그인에 바꾼다
export async function studentBoard(sb, studentId, date, month = null) {
  const { data, error } = await db(sb).rpc("student_board", { p_student: studentId ?? null, p_on: date, p_month: month ?? null });   /* (뎌) 달을 넘겨 가며 본다 — 안 주면 오늘의 달(0156) */
  if (error) throw new Error(`학생을 못 읽음: ${error.message}`);
  if (!data) throw new Error("학생은 학원 사람의 화면입니다");
  return data;
}
/** + 학생 — 이름·학년·학교·전화·들어온 날(비면 오늘). 반·교재는 뒤에서 */
export async function addStudent(sb, f, date) {
  const p = parseStudent(f);
  const ins = row(await db(sb).from("students").insert({ ...p, joined_on: p.joined_on ?? date, state: "active" }).select("id").single(), "학생을 못 넣음");
  return ins.id;
}
export const STALE = "다른 사람이 먼저 고쳤습니다 — 새로고침 뒤 다시 적어 주세요";   // 0-3 읽은 줄이 그대로일 때만 저장
export async function setStudent(sb, studentId, f, seenAt = null) {
  const p = parseStudent(f);
  let q = db(sb).from("students").update(p).eq("id", studentId); if (seenAt) q = q.eq("updated_at", seenAt);
  const r = row(await q.select("id"), "학생을 못 고침");
  if (!r?.length) { if (seenAt && row(await db(sb).from("students").select("id").eq("id", studentId).maybeSingle(), "학생을 못 읽음")) throw new Error(STALE); throw new Error("고쳐진 줄이 없습니다"); }
}
/** 퇴원 — state left + 나간 날(줄은 남는다 · 반 줄도 그날로 닫는다) · 복귀 — active + 나간 날 지움 */
export async function setState(sb, studentId, state, on = null) {
  if (!["active", "paused", "left"].includes(state)) throw new Error(`상태가 아닙니다: ${state}`);
  if (state === "left" && !isDate(on)) throw new Error("나간 날을 적으세요");
  changed(await db(sb).from("students").update({ state, left_on: state === "left" ? on : null }).eq("id", studentId).select("id"), "상태를 못 바꿈");
  if (state === "left") changed(await db(sb).from("class_member").update({ to_date: on }).eq("student_id", studentId).is("to_date", null).select("class_id"), "반 줄을 못 닫음", { zero: "ok" });
}
/** 반 옮기기 — 지금 반 줄을 전날로 닫고 새 줄(이력이 남아 회차·수강료가 그날부터 갈린다, 0002) */
export async function setClass(sb, studentId, classId, fromDate) {
  if (!classId) throw new Error("반을 고르세요"); if (!isDate(fromDate)) throw new Error(`날짜가 아닙니다: ${fromDate}`);
  const cur = row(await db(sb).from("class_member").select("class_id,from_date").eq("student_id", studentId).is("to_date", null), "반 줄을 못 읽음") ?? [];
  if (cur.some((c) => c.class_id === classId)) throw new Error("이미 그 반입니다");
  const prev = new Date(`${fromDate}T00:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1); const before = prev.toISOString().slice(0, 10);
  for (const c of cur) changed(await db(sb).from("class_member").update({ to_date: c.from_date > before ? c.from_date : before }).eq("student_id", studentId).eq("class_id", c.class_id).eq("from_date", c.from_date).select("class_id"), "반 줄을 못 닫음", { zero: "ok" });
  row(await db(sb).from("class_member").insert({ class_id: classId, student_id: studentId, from_date: fromDate }).select("class_id"), "반에 못 넣음");
  return { closed: cur.length };
}
/** 학생별 금액 — 「언제부터 얼마」 이력(13 과 같은 표 fee_rule · 지난 것은 닫는다) */
export async function setFee(sb, studentId, amount, fromDate) {
  const n = Number(String(amount ?? "").replace(/[^0-9]/g, "")); if (!(n > 0)) throw new Error("금액을 적으세요"); if (!isDate(fromDate)) throw new Error(`날짜가 아닙니다: ${fromDate}`);
  const prev = new Date(`${fromDate}T00:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1); const before = prev.toISOString().slice(0, 10);
  const cur = row(await db(sb).from("fee_rule").select("id,from_date").eq("student_id", studentId).is("to_date", null), "단가 줄을 못 읽음") ?? [];
  for (const c of cur) changed(await db(sb).from("fee_rule").update({ to_date: c.from_date > before ? c.from_date : before }).eq("id", c.id).select("id"), "단가 줄을 못 닫음");
  row(await db(sb).from("fee_rule").insert({ student_id: studentId, from_date: fromDate, amount: n }).select("id"), "단가 줄을 못 넣음");
  return { amount: n };
}
/** 상담 적기 — 때 · 갈래(전화·정기·방문) · 내용. 원장만(권한 ops.consult 는 화면이 가린다 · 표 규칙은 학원 사람) */
export async function addConsult(sb, { studentId, at = null, way = null, body }, by = null) {
  const b = String(body ?? "").trim(); if (!b) throw new Error("상담 내용을 적으세요");
  const ins = row(await db(sb).from("consult").insert({ student_id: studentId, at: at || new Date().toISOString(), way: String(way ?? "").trim() || null, body: b, created_by: by }).select("id").single(), "상담을 못 적음");
  return ins.id;
}
/** 형제 묶기 — 다른 아이의 학부모 계정을 이 아이에게도 잇는다(같은 집) */
export async function linkSibling(sb, studentId, otherId) {
  if (!otherId || otherId === studentId) throw new Error("형제를 고르세요");
  const theirs = row(await db(sb).from("parent_student").select("parent_profile_id,rel").eq("student_id", otherId), "학부모를 못 읽음") ?? [];
  if (!theirs.length) throw new Error("그 아이에게 이어진 학부모 계정이 없습니다 — 먼저 그 아이에게 학부모 계정을 발급하세요");
  const mine = row(await db(sb).from("parent_student").select("parent_profile_id").eq("student_id", studentId), "학부모를 못 읽음") ?? [];
  const fresh = theirs.filter((t) => !mine.some((m) => m.parent_profile_id === t.parent_profile_id)).map((t) => ({ parent_profile_id: t.parent_profile_id, student_id: studentId, rel: t.rel }));
  if (fresh.length) row(await db(sb).from("parent_student").insert(fresh).select("student_id"), "형제로 못 묶음");
  return { linked: fresh.length };
}
/** 계정 하나를 auth 에 만든다(서버 자신) — 이미 있으면 그 계정 */
async function ensureAuthUser(svc, email) {
  const r = await svc.auth.admin.createUser({ email, password: FIRST_PW, email_confirm: true });
  if (!r.error) return { id: r.data.user.id, created: true };
  if (/already|exists|registered/i.test(String(r.error.message))) throw new Error(`이미 있는 아이디입니다: ${email.split("@")[0]} — 다른 아이디로`);
  throw new Error(`계정을 못 만듦: ${r.error.message}`);
}
/** 학부모 계정 이름 고치기((가)-⑩ · 남긴 것 14) — 이 아이에게 이어진 계정만(parent_student) · 형제가 같은 계정을 쓰면 둘 다 그 이름(줄이 하나다) · 비밀번호는 안 건드린다(대전제-12 는 비밀번호 얘기 — 이관된 계정도 이름은 고친다) · 헤더 알약(shell 의 me.name)과 14 학부모 줄이 이 값을 읽는다 */
export async function setParentName(sb, studentId, profileId, name) {
  const nm = parseParentName(name);
  const link = row(await db(sb).from("parent_student").select("student_id").eq("parent_profile_id", profileId).eq("student_id", studentId).maybeSingle(), "잇기를 못 읽음");
  if (!link) throw new Error("이 아이에게 이어진 학부모 계정이 아닙니다");
  const r = changed(await db(sb).from("profiles").update({ name: nm }).eq("id", profileId).eq("role", "parent").select("id"), "이름을 못 고침");
  if (!r?.length) throw new Error("학부모 계정이 아닙니다");
  return { name: nm };
}
/** 학생 계정 발급 — 아이디(영문·숫자) → auth 계정(0000) + profiles(학생 · 바꿔야 들어감 · 앱이 발급) + students.profile_id */
export async function issueStudentAccount(svc, sb, studentId, loginId) {
  const id = parseLoginId(loginId);
  const st = row(await db(sb).from("students").select("id,name,profile_id").eq("id", studentId).single(), "학생을 못 읽음"); if (!st) throw new Error("학생이 없습니다");
  if (st.profile_id) throw new Error("이미 계정이 있습니다");
  const em = toLoginEmail("student", id); if (!em.ok) throw new Error(em.msg);
  const u = await ensureAuthUser(svc, em.email);
  row(await db(svc).from("profiles").insert({ id: u.id, role: "student", name: st.name, login_id: id, must_change_pw: true, issued_by_app: true }).select("id"), "사람 줄을 못 넣음");
  changed(await db(svc).from("students").update({ profile_id: u.id }).eq("id", studentId).select("id"), "학생에 계정을 못 붙임");
  return { login_id: id, password: FIRST_PW };
}
/** 학부모 계정 발급 — 전화번호가 아이디. 같은 번호의 계정이 이미 있으면(형제) 만들지 않고 잇는다 */
export async function issueParentAccount(svc, sb, studentId, phone, rel = null) {
  const em = toLoginEmail("parent", phone); if (!em.ok) throw new Error(em.msg);
  const loginId = em.email.split("@")[0];
  const st = row(await db(sb).from("students").select("id,name").eq("id", studentId).single(), "학생을 못 읽음"); if (!st) throw new Error("학생이 없습니다");
  let pid = (row(await db(svc).from("profiles").select("id").eq("login_id", loginId).maybeSingle(), "사람 줄을 못 읽음"))?.id ?? null;
  let created = false;
  if (!pid) { const u = await ensureAuthUser(svc, em.email); pid = u.id; created = true; row(await db(svc).from("profiles").insert({ id: pid, role: "parent", name: `${st.name} 학부모`, phone: loginId, login_id: loginId, must_change_pw: true, issued_by_app: true }).select("id"), "사람 줄을 못 넣음"); }
  const have = row(await db(svc).from("parent_student").select("student_id").eq("parent_profile_id", pid).eq("student_id", studentId), "잇기를 못 읽음") ?? [];
  if (!have.length) row(await db(svc).from("parent_student").insert({ parent_profile_id: pid, student_id: studentId, rel: rel || null }).select("student_id"), "학부모를 못 이음");
  changed(await db(svc).from("students").update({ parent_phone: loginId }).eq("id", studentId).select("id"), "학부모 전화를 못 적음");
  return { login_id: loginId, created, password: created ? FIRST_PW : null };
}
/** 비밀번호 0000 으로 초기화 — 앱이 발급한 계정만(대전제-12). must_change_pw 를 켜는 것이 곧 초기화(0032) */
export async function resetPassword(svc, sb, profileId) {
  const p = row(await db(sb).from("profiles").select("id,role,login_id,issued_by_app").eq("id", profileId).single(), "사람 줄을 못 읽음"); if (!p) throw new Error("계정이 없습니다");
  if (!canReset(p)) throw new Error("전환일 전엔 재원생·학부모 비밀번호를 안 건드립니다(대전제-12) — 앱이 발급한 계정만 초기화합니다");
  if (!["student", "parent"].includes(p.role)) throw new Error("학생·학부모 계정만");
  const r = await svc.auth.admin.updateUserById(profileId, { password: FIRST_PW }); if (r.error) throw new Error(`비밀번호를 못 바꿈: ${r.error.message}`);
  changed(await db(svc).from("profiles").update({ must_change_pw: true }).eq("id", profileId).select("id"), "표시를 못 켬");
  return { login_id: p.login_id, password: FIRST_PW };
}
