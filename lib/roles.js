/** 역할 낱말 한 벌 — DB(v3.profiles.role 의 CHECK)와 같은 다섯. 여기에 DB 에 없는 낱말을 더하지 않는다. */
export const ROLES = Object.freeze({ PRINCIPAL: "principal", INSTRUCTOR: "instructor", ASSISTANT: "assistant", STUDENT: "student", PARENT: "parent" });
export const ROLE_NAME = Object.freeze({ principal: "원장", instructor: "선생님", assistant: "조교", student: "학생", parent: "학부모" });   // (어64) 원장님 2026-09-16 「이름만 강사말고 선생님이라고 해줘」 · 화면에 나오는 역할 이름은 여기 하나에서 나온다
export const STAFF = Object.freeze([ROLES.PRINCIPAL, ROLES.INSTRUCTOR, ROLES.ASSISTANT]);
export const isStaff = (role) => STAFF.includes(role);

/** 로그인 아이디 → 인증이 요구하는 이메일. 꼬리 도메인은 여기서만 붙는다(목업 00 「화면에 안 보이는 것」).
 *    학생   chloe0515        → chloe0515@chloe-eng.internal   (chloe + 폰 뒤 4자리, 실측 20/21)
 *    학부모 010-1234-5678    → 01012345678@chloe-eng.internal  (전화번호가 곧 아이디, 실측 20/20)
 *    원장 진짜 이메일 → 그대로 (도메인을 덧붙이면 원장님이 못 들어온다)
 *    선생님·조교 park1 → park1@chloe-eng.internal   ((어64) 앱에서 낸 계정은 아이디만 있다 · 꼴은 STAFF_ID 한 곳)
 *  ⚠️ 이미 꼬리가 붙은 글자도 받는다 — 두 번 붙이면 아무도 못 들어온다. */
export const INTERNAL_DOMAIN = "chloe-eng.internal";
/** (어64) 직원 아이디 꼴 — 영문 소문자로 시작하는 4~20자(소문자·숫자·밑줄). 표 쪽 0171 profiles_login_id_shape 와 **같은 꼴**이라 한쪽만 고치면 저장이 통째로 막힌다.
 *  chloe 로 시작하는 것은 학생 아이디라 따로 막는다((어46) 과 같은 사고) */
export const STAFF_ID = /^[a-z][a-z0-9_]{3,19}$/;
export const isStaffId = (s) => STAFF_ID.test(String(s ?? "")) && !/^chloe/.test(String(s ?? ""));
export function toLoginEmail(kind, raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return { ok: false, msg: "아이디를 안 쳤습니다" };
  if (s.includes("@")) return s.endsWith("@" + INTERNAL_DOMAIN) || kind === "staff" ? { ok: true, email: s } : { ok: false, msg: "이메일은 원장·선생님·조교 칸에 치세요" };
  if (kind === "parent") { const digits = s.replace(/[^0-9]/g, ""); if (digits.length < 10) return { ok: false, msg: "전화번호를 숫자로 다 쳐 주세요 (예 01012345678)" }; return { ok: true, email: `${digits}@${INTERNAL_DOMAIN}` }; }
  if (kind === "student") { const id = s.replace(/\s+/g, ""); if (!/^[a-z0-9]+$/.test(id)) return { ok: false, msg: "아이디는 영문·숫자입니다 (예 chloe0515)" }; return { ok: true, email: `${id}@${INTERNAL_DOMAIN}` }; }
  if (kind === "staff") { const id = s.replace(/\s+/g, ""); if (isStaffId(id)) return { ok: true, email: `${id}@${INTERNAL_DOMAIN}` }; }   // (어64) 앱에서 낸 선생님·조교는 아이디만 친다
  return { ok: false, msg: "이메일이나 아이디를 쳐 주세요" };
}
/** 화면에 보일 아이디 — 꼬리를 뗀다. 원장님이 아이에게 불러 줄 글자는 이것이다 */
export const displayId = (email) => String(email ?? "").replace(new RegExp("@" + INTERNAL_DOMAIN + "$"), "");
