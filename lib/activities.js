// 활동 이름은 **교재마다 다르다.**
//
// 문법은 설명 → 문제 → 본교재 → 워크북 순서고, 독해는 예습 → 테스트 → 복습이고,
// 어떤 교재는 예습/복습 → 클래스카드/채점 이다. 그래서 목록을 못 박아 두면
// 언제나 모자란다. 자주 쓰는 것만 아래에 두고, **직접 적을 수 있게** 한다.
//
// 한 번 적은 것은 다음부터 목록에 뜬다 (같은 것을 두 가지로 적으면 루틴이 깨진다).

export const DEFAULT_ACTIVITIES = [
  "설명",
  "문제",
  "본교재",
  "워크북",
  "예습",
  "복습",
  "테스트",
  "클래스카드",
  "채점",
  "실전모의고사",
];

/** 자주 쓰는 것 + 이미 교재에 적어 둔 것 */
export function activityList(used = []) {
  const out = [...DEFAULT_ACTIVITIES];
  used.forEach((v) => {
    const s = (v || "").toString().trim();
    if (s && !out.includes(s)) out.push(s);
  });
  return out;
}
