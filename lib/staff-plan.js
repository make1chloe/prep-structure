/** (어64) 직원(선생님·조교) 계정 판단 한 벌(순수) — 원장님 2026-09-16 「원장말고 다른 테스트 계정도 추가해줘 역할 선생님 권한 - 설정페이지에서 열람페이지 조절가능하게」.
 *  볼 것을 정하는 자리는 이미 있다(설정 › 누가 무엇을 보나 · lib/perm.js 34칸) — 없던 것은 **계정을 내는 길** 하나뿐이라 그것만 짓는다. */
import { ROLES, ROLE_NAME, isStaffId } from "./roles.js";

/** 원장이 줄 수 있는 역할 둘. 원장(principal)은 못 준다 — 원장은 하나다 */
export const STAFF_ROLES = Object.freeze([
  [ROLES.INSTRUCTOR, ROLE_NAME[ROLES.INSTRUCTOR]],
  [ROLES.ASSISTANT, ROLE_NAME[ROLES.ASSISTANT]],
]);
export const isStaffRole = (r) => STAFF_ROLES.some(([k]) => k === r);

/** 직원 아이디 — 꼴은 lib/roles.js STAFF_ID 한 곳(로그인도 그것으로 이메일을 만든다 · 표 쪽 0171 도 같은 꼴) */
export const STAFF_ID_TEXT = "영문 소문자로 시작하는 4~20자(소문자·숫자·밑줄)";
export const parseStaffLoginId = (raw) => {
  const id = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!id) throw new Error("아이디가 비었음");
  if (/^chloe/.test(id)) throw new Error("chloe 로 시작하는 것은 학생 아이디");
  if (!isStaffId(id)) throw new Error(`직원 아이디는 ${STAFF_ID_TEXT}`);
  return id;
};
export const parseStaffName = (raw) => {
  const nm = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (nm.length < 1 || nm.length > 20) throw new Error("이름은 1~20자");
  return nm;
};
/** 적는 그 자리에서 빨갛게 말할 글 — 빈 칸이면 아직 아무 말도 안 한다((퍼) 연동 설정과 같은 결) */
export const staffIdNag = (raw) => { const s = String(raw ?? "").trim(); if (!s) return ""; try { parseStaffLoginId(s); return ""; } catch (e) { return String(e.message); } };
/** 줄 하나의 상태 — 화면이 글로 안 적고 이것을 쓴다(대전제-0) */
export const staffState = (p) => (p?.state === "active" ? "쓰는 중" : "닫힘");
