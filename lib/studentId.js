// 학생 로그인 아이디 생성 규칙
//  - 기본: "chloe" + 전화번호 뒷자리 4개  (예: 010-1234-5678 -> chloe5678)
//  - 학생 전화가 없으면 학부모 전화 뒷자리로 대체
//  - 뒷자리가 겹치면 -2, -3 ... 을 붙여 중복을 피함
//  - 원장님이 선생님 화면에서 직접 수정도 가능(수정 우선)

export function lastDigits(phone, n = 4) {
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
 * **학부모 로그인 아이디** — `chloe` + 어머니 번호에서 앞의 010 을 뺀 8자리.
 *   010-1234-5678  →  chloe12345678
 *
 * 원장님과 정한 것 (2026-08-05)
 *   · 학생은 뒷 4자리(chloe5678)인데, **어머니 번호 뒷자리가 아이와 같은 집이 흔하다.**
 *     가족끼리 번호를 이어 쓰기 때문이다. 그대로 두면 chloe5678-2 가 되고,
 *     그게 아이 것인지 어머니 것인지 화면을 봐야 안다.
 *   · 그렇다고 뒤에 p 를 붙이면 「어머니들이 영어를 잘 몰라 헷갈린다」.
 *     외워야 할 영어 글자를 늘리지 않는다.
 *   · 그래서 **자릿수로 가른다.** 학생은 4자리, 학부모는 8자리라 절대 안 겹친다.
 *     설명도 한 문장이다 — 「chloe 뒤에 어머니 번호를 010 빼고 적으시면 됩니다」.
 *     어머니가 외울 것은 자기 전화번호뿐이다.
 *
 * 형제자매가 있어도 **어머니 한 분에 계정 하나**다. 아이가 아니라 어머니
 * 번호에서 나오므로 저절로 그렇게 된다 — 한 번 로그인해서 두 아이를 다 본다.
 */
export function parentLoginId(parentPhone) {
  const d = (parentPhone || "").replace(/\D/g, "");
  if (d.length < 8) return "";
  // 앞의 010(또는 011·016 …) 을 뗀 나머지. 국제번호(82)로 적어도 뒤 8자리는 같다
  return `chloe${d.slice(-8)}`;
}

/**
 * 이 아이디가 **학부모 것인가.**
 * 자릿수로 가른 규칙이라, 세는 것만으로 알 수 있다.
 */
export function isParentId(loginId) {
  return /^chloe\d{8}(-\d+)?$/.test((loginId || "").trim());
}
