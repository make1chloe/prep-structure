/** 역할 낱말 한 벌 — DB(v3.profiles.role 의 CHECK)와 같은 다섯. 여기에 DB 에 없는 낱말을 더하지 않는다. */
export const ROLES = Object.freeze({ PRINCIPAL: "principal", INSTRUCTOR: "instructor", ASSISTANT: "assistant", STUDENT: "student", PARENT: "parent" });
export const ROLE_NAME = Object.freeze({ principal: "원장", instructor: "강사", assistant: "조교", student: "학생", parent: "학부모" });
export const STAFF = Object.freeze([ROLES.PRINCIPAL, ROLES.INSTRUCTOR, ROLES.ASSISTANT]);
export const isStaff = (role) => STAFF.includes(role);

/** 로그인 아이디 → 인증이 요구하는 이메일. 꼬리 도메인은 여기서만 붙는다(목업 00 「화면에 안 보이는 것」).
 *    학생   chloe0515        → chloe0515@chloe-eng.internal   (chloe + 폰 뒤 4자리, 실측 20/21)
 *    학부모 010-1234-5678    → 01012345678@chloe-eng.internal  (전화번호가 곧 아이디, 실측 20/20)
 *    원장·강사·조교 진짜 이메일 → 그대로 (도메인을 덧붙이면 원장님이 못 들어온다)
 *  ⚠️ 이미 꼬리가 붙은 글자도 받는다 — 두 번 붙이면 아무도 못 들어온다. */
export const INTERNAL_DOMAIN = "chloe-eng.internal";
export function toLoginEmail(kind, raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return { ok: false, msg: "아이디를 안 쳤습니다" };
  if (s.includes("@")) return s.endsWith("@" + INTERNAL_DOMAIN) || kind === "staff" ? { ok: true, email: s } : { ok: false, msg: "이메일은 원장·강사·조교 칸에 치세요" };
  if (kind === "parent") { const digits = s.replace(/[^0-9]/g, ""); if (digits.length < 10) return { ok: false, msg: "전화번호를 숫자로 다 쳐 주세요 (예 01012345678)" }; return { ok: true, email: `${digits}@${INTERNAL_DOMAIN}` }; }
  if (kind === "student") { const id = s.replace(/\s+/g, ""); if (!/^[a-z0-9]+$/.test(id)) return { ok: false, msg: "아이디는 영문·숫자입니다 (예 chloe0515)" }; return { ok: true, email: `${id}@${INTERNAL_DOMAIN}` }; }
  return { ok: false, msg: "이메일을 쳐 주세요" };
}
/** 화면에 보일 아이디 — 꼬리를 뗀다. 원장님이 아이에게 불러 줄 글자는 이것이다 */
export const displayId = (email) => String(email ?? "").replace(new RegExp("@" + INTERNAL_DOMAIN + "$"), "");
