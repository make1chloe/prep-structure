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
