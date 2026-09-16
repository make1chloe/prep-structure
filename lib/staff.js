/** (어64) 직원(선생님·조교) 계정을 원장님이 앱에서 낸다 · 원장님 2026-09-16 「원장말고 다른 테스트 계정도 추가해줘 역할 선생님 권한 - 설정페이지에서 열람페이지 조절가능하게」.
 *  볼 것을 정하는 자리는 이미 있다(설정 › 누가 무엇을 보나 · v2.role_access) — 여기는 **계정을 내고 · 역할을 바꾸고 · 닫는** 손만.
 *  ⚠️ 지우지 않는다(대전제-6) — 닫으면 state='left' 라 못 들어오고, 되살리면 그대로 돌아온다. 비밀번호는 안 건드린다(대전제-12 · 첫 발급 때만 0000). */
import { db } from "./supabase.js";
import { INTERNAL_DOMAIN, ROLES, ROLE_NAME } from "./roles.js";
import { FIRST_PW } from "./student-plan.js";
import { ensureAuthUser } from "./student.js";   // (어66) 이미 있는 계정을 잇는 길은 아이 쪽과 한 벌((어36))
import { changed, row, rows } from "./sqlError.js";
import { parseStaffLoginId, parseStaffName, isStaffRole } from "./staff-plan.js";

/** 직원 목록 — 원장은 맨 위(닫을 수 없다) · 그다음 쓰는 중 · 닫힌 것은 맨 밑 */
export async function listStaff(sb) {
  const all = rows(await db(sb).from("profiles").select("id,name,role,state,login_id").in("role", [ROLES.PRINCIPAL, ROLES.INSTRUCTOR, ROLES.ASSISTANT]).order("name"), "직원");
  const rank = (p) => (p.role === ROLES.PRINCIPAL ? 0 : p.state === "active" ? 1 : 2);
  return [...all].sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
}

/** 직원 계정 발급 — 아이디(영문 소문자 4~20) → auth 계정(첫 비밀번호는 FIRST_PW · 첫 로그인에 바꿈) + profiles(선생님·조교).
 *  (어66) **이미 그 아이디의 계정이 있으면 새로 만들지 않고 잇는다**(아이 쪽 (어36) 과 같은 길 · ensureAuthUser 한 벌) —
 *  앞선 발급이 사람 줄에서 걸려 계정만 남으면 「이미 등록된 이메일」로 영영 못 잇고, 사람 줄이 없으니 목록에도 안 떴다.
 *  앱이 낸 계정이 아니면 **비밀번호는 쓰던 것 그대로**이고 바꾸라고 묻지도 않는다(대전제-12) · 남의 역할이면 막는다 */
export async function issueStaffAccount(svc, sb, { name, loginId, role }) {
  const nm = parseStaffName(name), id = parseStaffLoginId(loginId);
  if (!isStaffRole(role)) throw new Error("선생님·조교만 낼 수 있습니다");
  const taken = row(await db(sb).from("profiles").select("id,role,name").eq("login_id", id).maybeSingle(), "사람 줄");
  if (taken) throw new Error(`이미 쓰는 아이디입니다: ${id}`);

  const email = `${id}@${INTERNAL_DOMAIN}`;
  const u = await ensureAuthUser(svc, email);   // (어66) 이미 있으면 새로 안 만들고 잇는다 — 원장님 2026-09-16 「옛앱에서 만든 계정이 있는거 같은데 이거 목록에 왜 안떠」
  const had = row(await db(svc).from("profiles").select("id,role,name").eq("id", u.id).maybeSingle(), "사람 줄");
  if (had?.role === ROLES.PRINCIPAL) throw new Error("원장 계정입니다. 아이디를 다르게 지으세요");
  if (had && !isStaffRole(had.role)) throw new Error(`그 아이디는 ${ROLE_NAME[had.role] ?? had.role} 계정입니다. 아이디를 다르게 지으세요`);
  if (had) changed(await db(svc).from("profiles").update({ role, name: nm, login_id: id, state: "active" }).eq("id", u.id).select("id"), "사람 줄을 못 고침");
  else changed(await db(svc).from("profiles").insert({ id: u.id, role, name: nm, login_id: id, state: "active", must_change_pw: u.issuedByApp }).select("id"), "사람 줄을 못 세움");
  return { id: u.id, login_id: id, name: nm, role, password: u.issuedByApp ? FIRST_PW : null, adopted: !u.created };
}

/** 역할 바꾸기 — 선생님 ↔ 조교만. 원장은 주지도 뺏지도 않는다 */
export async function setStaffRole(sb, profileId, role) {
  if (!isStaffRole(role)) throw new Error("선생님·조교만 고를 수 있습니다");
  const r = changed(await db(sb).from("profiles").update({ role }).eq("id", profileId).in("role", [ROLES.INSTRUCTOR, ROLES.ASSISTANT]).select("id"), "역할을 못 고침");
  if (!r?.length) throw new Error("선생님·조교가 아닙니다");
  return { role };
}

/** 닫기·되살리기 — 지우지 않는다(대전제-6) · 원장 줄과 제 줄은 못 닫는다 */
export async function setStaffState(sb, profileId, state, meId = null) {
  if (!["active", "left"].includes(state)) throw new Error(`상태가 아닙니다: ${state}`);
  if (state === "left" && profileId === meId) throw new Error("제 계정은 못 닫습니다");
  const r = changed(await db(sb).from("profiles").update({ state }).eq("id", profileId).in("role", [ROLES.INSTRUCTOR, ROLES.ASSISTANT]).select("id"), "상태를 못 고침");
  if (!r?.length) throw new Error("선생님·조교가 아닙니다");
  return { state };
}
