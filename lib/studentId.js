// 학생 로그인 아이디 생성 규칙
//  - 기본: "chloe" + 전화번호 뒷자리 4개  (예: 010-1234-5678 -> chloe5678)
//  - 학생 전화가 없으면 학부모 전화 뒷자리로 대체
//  - 뒷자리가 겹치면 -2, -3 ... 을 붙여 중복을 피함
//  - 원장님이 선생님 화면에서 직접 수정도 가능(수정 우선)

function lastDigits(phone, n = 4) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 1) return "";
  return digits.slice(-n);
}

// 한 학생의 "기본" 로그인 아이디 (충돌 미고려)
export function baseLoginId(studentPhone, parentPhone) {
  const tail = lastDigits(studentPhone) || lastDigits(parentPhone);
  if (!tail) return "";
  return `chloe${tail}`;
}

// 이미 쓰고 있는 아이디 집합에서 겹치지 않는 아이디로 확정
//  taken: Set<string> (이미 사용중인 아이디들)
export function resolveLoginId(base, taken) {
  if (!base) return "";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * **학부모 로그인 아이디 — 전화번호 그대로.**
 *   010-1234-5678  →  01012345678
 *
 * 원장님과 정한 것 (2026-08-05)
 *   처음에는 학생처럼 chloe 를 앞에 붙이려 했다. 그런데 그러면
 *   「chloe 뒤에 010 을 빼고」 라는 **규칙을 설명해야** 한다. 어머니들이 영어를
 *   잘 모르신다고 하셨는데, 설명이 필요한 순간 이미 어렵다.
 *
 *   전화번호 그대로면 설명이 없다 — 「아이디는 어머니 전화번호예요」 로 끝난다.
 *   잊어도 스스로 다시 만들어 내실 수 있고, 전화로 불러드릴 일도 없다.
 *
 *   학생 아이디는 chloe 로 시작하고 이것은 숫자로만 되어 있어서 절대 안 겹친다.
 *   형제자매가 있어도 **어머니 한 분에 계정 하나**다 — 번호에서 나오니 저절로 그렇다.
 *
 * 적으실 때 하이픈을 넣든 안 넣든, 국제번호(+82 10-…)로 적으시든 같은
 * 아이디가 나온다. 숫자만 남기고 앞의 82 를 0 으로 되돌린다.
 */
export function parentLoginId(parentPhone) {
  let d = (parentPhone || "").replace(/\D/g, "");
  // +82 10-1234-5678 → 01012345678
  if (d.startsWith("82")) d = `0${d.slice(2)}`;
  if (d.length < 9 || d.length > 11) return "";
  return d;
}

