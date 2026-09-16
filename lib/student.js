/** 학생 14 의 손 · 판 읽기(한 벌 student_board) · + 학생 · 고치기 · 퇴원·복귀(줄은 남는다) · 반 옮기기(이력) · 학생별 금액(fee_rule 이력) · 상담 적기 · 형제 묶기 · 계정 발급(학생 아이디 · 학부모 전화 · 첫 비밀번호 FIRST_PW · 바꿔야 들어감 · (어36) auth 에 이미 있는 아이디면 새로 안 만들고 잇는다) · 학부모 계정 이름 고치기 · 비밀번호 초기화(앱이 발급한 계정만, 대전제-12).
 *  계정은 서버 자신(service role)이 auth 에 만든다 — 사람 자격으로는 못 만든다. 판단은 lib/student-plan.js(순수) · 아이디 꼴은 lib/roles toLoginEmail 한 곳 */
import { db } from "./supabase.js";
import { toLoginEmail, ROLE_NAME } from "./roles.js";
import { parseStudent, parseLoginId, nextLoginId, canReset, parseParentName, suggestLoginId, FIRST_PW } from "./student-plan.js";
import { changed, row } from "./sqlError.js";
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
export { FIRST_PW };   // 첫 비밀번호는 lib/student-plan.js 한 곳((어65) 인증이 여섯 자 미만을 안 받는다) — must_change_pw 가 켜져 첫 로그인에 바꾼다
export async function studentBoard(sb, studentId, date, month = null) {
  const { data, error } = await db(sb).rpc("student_board", { p_student: studentId ?? null, p_on: date, p_month: month ?? null });   /* (뎌) 달을 넘겨 가며 본다 — 안 주면 오늘의 달(0156) */
  if (error) throw new Error(`학생을 못 읽음: ${error.message}`);
  if (!data) throw new Error("학생은 학원 사람의 화면입니다");
  return data;
}
/** + 학생 — 이름·학년·학교·전화·들어온 날(비면 오늘). 반·교재는 뒤에서 */
/** + 학생 · **전화번호가 있으면 앱 계정도 같이 낸다**((어54) · 원장님 2026-09-16 「학생 추가하면 전화번호있으면 바로 로그인정보 함께 생성되고 로그인 가능하게해줘 계속안돼」).
 *  아이디는 chloe + 전화 뒤 4자리(suggestLoginId 한 벌 · 겹치면 다섯째 자리에 2·3 … issueStudentAccount 가 굴린다) · 첫 비밀번호는 0000(들어가면 바꾸게 한다).
 *  **계정을 못 내도 아이는 들어간다** — 아이를 넣다 말면 더 나쁘다. 못 낸 까닭을 그대로 돌려줘 화면이 말하게 한다(대전제-0 · 거짓말 안 함).
 *  서버 자신(svc)을 안 주면 옛날처럼 아이만 넣는다(걷기·씨앗) */
export async function addStudent(sb, f, date, { svc = null } = {}) {
  const p = parseStudent(f);
  const ins = row(await db(sb).from("students").insert({ ...p, joined_on: p.joined_on ?? date, state: "active" }).select("id").single(), "학생을 못 넣음");
  if (!svc) return { id: ins.id, account: null, why: null };
  if (!(p.phone || p.parent_phone)) return { id: ins.id, account: null, why: "전화번호가 없어 계정은 아직 · 전화를 적고 🔑 계정에서 발급" };
  try { return { id: ins.id, account: await issueStudentAccount(svc, sb, ins.id, suggestLoginId(p, date)), why: null }; }
  catch (e) { return { id: ins.id, account: null, why: String(e?.message ?? e) }; }
}
/** 고른 아이들에게 한 번에 계정 발급((어54) · 대전제-20) · 이미 있는 아이는 건너뛴다 · 전화가 없으면 건너뛴다 · 하나가 막혀도 나머지는 낸다(막힌 것은 이름과 함께 돌려준다) */
export async function issueAccountsMany(svc, sb, ids = [], date = "") {
  const list = [...new Set((ids ?? []).filter(Boolean))]; if (!list.length) throw new Error("고른 아이가 없습니다");
  const rows = row(await db(sb).from("students").select("id,name,phone,parent_phone,profile_id").in("id", list), "아이들을 못 읽음") ?? [];
  const made = [], skipped = [], failed = [];
  for (const st of rows) {
    if (st.profile_id) { skipped.push(`${st.name} 이미 있음`); continue; }
    if (!(st.phone || st.parent_phone)) { skipped.push(`${st.name} 전화 없음`); continue; }
    try { const a = await issueStudentAccount(svc, sb, st.id, suggestLoginId(st, date)); made.push(`${st.name} ${a.login_id}`); }
    catch (e) { failed.push(`${st.name}: ${e?.message ?? e}`); }
  }
  return { made, skipped, failed, n: made.length };
}
export const STALE = "다른 사람이 먼저 고쳤습니다. 새로고침 뒤 다시 적어 주세요";   // 0-3 읽은 줄이 그대로일 때만 저장
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
/** 여럿 한 번에((어28) · 대전제-20 · 원장님 2026-09-15 「선택후 일괄액션」) · 하나씩의 손(setState · setClass)을 차례로 돌린다(판단 두 벌 없음). 막히면 그 아이 이름을 붙여 던진다 · 반 옮기기는 「이미 그 반」인 아이를 건너뛰고 센다 */
async function nameOf(sb, id) { const { data } = await db(sb).from("students").select("name").eq("id", id).maybeSingle(); return data?.name ?? id; }
export async function setStateMany(sb, ids = [], state, on = null) {
  const list = [...new Set((ids ?? []).filter(Boolean))]; if (!list.length) throw new Error("고른 아이가 없습니다");
  let n = 0; for (const id of list) { try { await setState(sb, id, state, on); n++; } catch (e) { throw new Error(`${await nameOf(sb, id)}: ${e.message}`); } }
  return { n };
}
export async function setClassMany(sb, ids = [], classId, fromDate) {
  const list = [...new Set((ids ?? []).filter(Boolean))]; if (!list.length) throw new Error("고른 아이가 없습니다");
  let n = 0, skipped = 0; for (const id of list) { try { await setClass(sb, id, classId, fromDate); n++; } catch (e) { if (e.message === "이미 그 반입니다") { skipped++; continue; } throw new Error(`${await nameOf(sb, id)}: ${e.message}`); } }
  return { n, skipped };
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
/** 상담 적기 · 때 · 유형(전화·정기·방문) · 내용. 원장만(권한 ops.consult 는 화면이 가린다 · 표 규칙은 학원 사람) */
export async function addConsult(sb, { studentId, at = null, way = null, body }, by = null) {
  const b = String(body ?? "").trim(); if (!b) throw new Error("상담 내용을 적으세요");
  const ins = row(await db(sb).from("consult").insert({ student_id: studentId, at: at || new Date().toISOString(), way: String(way ?? "").trim() || null, body: b, created_by: by }).select("id").single(), "상담을 못 적음");
  return ins.id;
}
/** 형제 묶기 — 다른 아이의 학부모 계정을 이 아이에게도 잇는다(같은 집) */
export async function linkSibling(sb, studentId, otherId) {
  if (!otherId || otherId === studentId) throw new Error("형제를 고르세요");
  const theirs = row(await db(sb).from("parent_student").select("parent_profile_id,rel").eq("student_id", otherId), "학부모를 못 읽음") ?? [];
  if (!theirs.length) throw new Error("그 아이에게 이어진 학부모 계정이 없습니다. 먼저 그 아이에게 학부모 계정을 발급하세요");
  const mine = row(await db(sb).from("parent_student").select("parent_profile_id").eq("student_id", studentId), "학부모를 못 읽음") ?? [];
  const fresh = theirs.filter((t) => !mine.some((m) => m.parent_profile_id === t.parent_profile_id)).map((t) => ({ parent_profile_id: t.parent_profile_id, student_id: studentId, rel: t.rel }));
  if (fresh.length) row(await db(sb).from("parent_student").insert(fresh).select("student_id"), "형제 연결을 못 함");
  return { linked: fresh.length };
}
/** auth 에서 이메일로 계정 찾기(서버 자신) · supabase-js 에는 이메일로 콕 집는 길이 없어 목록을 쪽씩 넘기며 찾는다(한 학원 사람 수라 몇 쪽 안 된다) */
async function findAuthUser(svc, email) {
  const want = String(email).toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const r = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (r.error) throw new Error(`계정을 못 찾음: ${r.error.message}`);
    const hit = (r.data?.users ?? []).find((u) => String(u.email ?? "").toLowerCase() === want);
    if (hit) return hit;
    if (!r.data?.nextPage) return null;
  }
  return null;
}
/** 계정 하나를 auth 에 만든다(서버 자신) · 이미 있으면 그 계정을 찾아 돌려준다(created:false).
 *  (어36) 원장님 9/15 「학생페이지들어가면이래」: 계정만 서고 사람 줄이 안 선 아이디(실 DB chloe9837)를 「이미 있는 아이디」로 막으면 이을 길이 없다. 앱이 만든 계정엔 user_metadata.issued_by_app 을 달아 두어, 이을 때 「0000 · 앱이 발급」인지 안다 */
export async function ensureAuthUser(svc, email) {
  const r = await svc.auth.admin.createUser({ email, password: FIRST_PW, email_confirm: true, user_metadata: { issued_by_app: true } });
  if (!r.error) return { id: r.data.user.id, created: true, issuedByApp: true };
  if (!/already|exists|registered/i.test(String(r.error.message))) throw new Error(`계정을 못 만듦: ${r.error.message}`);
  const u = await findAuthUser(svc, email);
  if (!u) throw new Error(`이미 있는 아이디인데 계정을 못 찾음: ${email.split("@")[0]}`);
  return { id: u.id, created: false, issuedByApp: Boolean(u.user_metadata?.issued_by_app) };
}
/** 학부모 계정 이름 고치기((가)-⑩ · 남긴 것 14) — 이 아이에게 이어진 계정만(parent_student) · 형제가 같은 계정을 쓰면 둘 다 그 이름(줄이 하나다) · 비밀번호는 안 건드린다(대전제-12 는 비밀번호 얘기 — 이관된 계정도 이름은 고친다) · 헤더 알약(shell 의 me.name)과 14 학부모 줄이 이 값을 읽는다 */
export async function setParentName(sb, studentId, profileId, name) {
  const nm = parseParentName(name);
  const link = row(await db(sb).from("parent_student").select("student_id").eq("parent_profile_id", profileId).eq("student_id", studentId).maybeSingle(), "배정을 못 읽음");
  if (!link) throw new Error("이 아이에게 이어진 학부모 계정이 아닙니다");
  const r = changed(await db(sb).from("profiles").update({ name: nm }).eq("id", profileId).eq("role", "parent").select("id"), "이름을 못 고침");
  if (!r?.length) throw new Error("학부모 계정이 아닙니다");
  return { name: nm };
}
/** 학생 계정 발급 · 아이디(영문·숫자) → auth 계정(0000) + profiles(학생 · 바꿔야 들어감 · 앱이 발급) + students.profile_id.
 *  (어36) auth 에 그 아이디의 계정이 이미 있으면 새로 만들지 않고 잇는다: 사람 줄이 없으면 세우고(앱이 만든 계정이면 0000·바꿔야 들어감 · 아니면 비밀번호 그대로 · issued_by_app 은 그대로 false, 대전제-12) ·
 *  학생 줄이 있는데 어느 아이에게도 안 이어졌으면 잇는다.
 *  (어46) 다른 아이의 것이거나 학생이 아닌 역할이면 **막지 않고 다음 아이디로**(chloe9837 → chloe98372 → … · 원장님 9/16 「같은 아이디 이미있으면 5번째에 2붙여서 자동생성」 · 판단 nextLoginId) · 아홉까지 다 찼으면 던진다 · 겹쳐서 바꿨으면 bumped 에 처음 것 */
export async function issueStudentAccount(svc, sb, studentId, loginId) {
  const first = parseLoginId(loginId);
  const st = row(await db(sb).from("students").select("id,name,profile_id").eq("id", studentId).single(), "학생을 못 읽음"); if (!st) throw new Error("학생이 없습니다");
  if (st.profile_id) throw new Error("이미 계정이 있습니다");
  let id = first;
  for (let tries = 0; tries < 9; tries++) {
    const byId = row(await db(svc).from("profiles").select("id,role").eq("login_id", id).maybeSingle(), "사람 줄을 못 읽음");   // 사람 줄로 먼저 본다 · 남의 것이면 계정을 만들지 않고 다음 아이디로
    if (byId) {
      if (byId.role !== "student") { id = nextLoginId(id); continue; }
      const owner = row(await db(svc).from("students").select("id").eq("profile_id", byId.id).maybeSingle(), "학생을 못 읽음");
      if (owner) { id = nextLoginId(id); continue; }
    }
    const em = toLoginEmail("student", id); if (!em.ok) throw new Error(em.msg);
    const u = await ensureAuthUser(svc, em.email);
    if (byId && byId.id !== u.id) throw new Error(`${id} 의 사람 줄과 계정이 어긋나 있습니다 · 다른 아이디로`);
    if (!byId) {
      const had = u.created ? null : row(await db(svc).from("profiles").select("id,role").eq("id", u.id).maybeSingle(), "사람 줄을 못 읽음");   // 계정은 있는데 사람 줄의 아이디가 다른 경우(옛 이관)
      if (had && had.role !== "student") throw new Error(`${id} 은 ${ROLE_NAME[had.role] ?? had.role} 계정입니다 · 다른 아이디로`);
      if (!had) row(await db(svc).from("profiles").insert({ id: u.id, role: "student", name: st.name, login_id: id, must_change_pw: u.issuedByApp, issued_by_app: u.issuedByApp }).select("id"), "사람 줄을 못 넣음");
    }
    changed(await db(svc).from("students").update({ profile_id: u.id }).eq("id", studentId).select("id"), "학생에 계정을 못 붙임");
    return { login_id: id, password: u.issuedByApp ? FIRST_PW : null, adopted: !u.created, bumped: id !== first ? first : null };
  }
  throw new Error(`${first} 부터 아홉 개가 다 찼습니다 · 다른 아이디로`);
}
/** 학부모 계정 발급 · 전화번호가 아이디. 같은 번호의 계정이 이미 있으면(형제) 만들지 않고 잇는다 · (어36) auth 에만 있고 사람 줄이 없던 번호도 잇는다(학생과 같은 길) */
export async function issueParentAccount(svc, sb, studentId, phone, rel = null) {
  const em = toLoginEmail("parent", phone); if (!em.ok) throw new Error(em.msg);
  const loginId = em.email.split("@")[0];
  const st = row(await db(sb).from("students").select("id,name").eq("id", studentId).single(), "학생을 못 읽음"); if (!st) throw new Error("학생이 없습니다");
  let pid = (row(await db(svc).from("profiles").select("id").eq("login_id", loginId).maybeSingle(), "사람 줄을 못 읽음"))?.id ?? null;
  let created = false, adopted = false, password = null;
  if (!pid) {
    const u = await ensureAuthUser(svc, em.email); pid = u.id; created = u.created; adopted = !u.created; password = u.issuedByApp ? FIRST_PW : null;
    const had = u.created ? null : row(await db(svc).from("profiles").select("id,role").eq("id", u.id).maybeSingle(), "사람 줄을 못 읽음");
    if (had && had.role !== "parent") throw new Error(`${loginId} 은 ${ROLE_NAME[had.role] ?? had.role} 계정입니다 · 학부모로 못 잇습니다`);
    if (!had) row(await db(svc).from("profiles").insert({ id: pid, role: "parent", name: `${st.name} 학부모`, phone: loginId, login_id: loginId, must_change_pw: u.issuedByApp, issued_by_app: u.issuedByApp }).select("id"), "사람 줄을 못 넣음");
  }
  const have = row(await db(svc).from("parent_student").select("student_id").eq("parent_profile_id", pid).eq("student_id", studentId), "배정을 못 읽음") ?? [];
  if (!have.length) row(await db(svc).from("parent_student").insert({ parent_profile_id: pid, student_id: studentId, rel: rel || null }).select("student_id"), "학부모를 못 이음");
  changed(await db(svc).from("students").update({ parent_phone: loginId }).eq("id", studentId).select("id"), "학부모 전화를 못 적음");
  return { login_id: loginId, created, adopted, password };
}
/** 비밀번호 0000 으로 초기화 — 앱이 발급한 계정만(대전제-12). must_change_pw 를 켜는 것이 곧 초기화(0032) */
export async function resetPassword(svc, sb, profileId) {
  const p = row(await db(sb).from("profiles").select("id,role,login_id,issued_by_app").eq("id", profileId).single(), "사람 줄을 못 읽음"); if (!p) throw new Error("계정이 없습니다");
  if (!canReset(p)) throw new Error("전환일 전엔 재원생·학부모 비밀번호를 안 건드립니다 · 앱이 발급한 계정만 초기화합니다");
  if (!["student", "parent"].includes(p.role)) throw new Error("학생·학부모 계정만");
  const r = await svc.auth.admin.updateUserById(profileId, { password: FIRST_PW }); if (r.error) throw new Error(`비밀번호를 못 바꿈: ${r.error.message}`);
  changed(await db(svc).from("profiles").update({ must_change_pw: true }).eq("id", profileId).select("id"), "표시를 못 켬");
  return { login_id: p.login_id, password: FIRST_PW };
}
