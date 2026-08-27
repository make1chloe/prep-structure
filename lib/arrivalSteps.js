/**
 * **등원 절차 세 단계 — 판단은 여기 한 벌** (탭 개편 C2, 2026-08-27).
 *
 * 등원 카드(ArrivalCard)와 등원 탭 배지(「몇 개 남았나」)가 같은 것을
 * 세어야 한다. 카드 안에만 있으면 배지가 제 셈을 또 만들게 된다 (원칙 1).
 */
export const STEPS = [
  { kind: "phone", label: "핸드폰 냈어요", ask: "핸드폰을 선생님께 내고 눌러주세요" },
  {
    kind: "attend",
    label: "출석 체크 했어요",
    ask: "출석 체크 앱에서 눌렀는지 확인해주세요",
    note: "누르면 선생님께 등원했다고 표시돼요",
  },
  { kind: "homework", label: "숙제 냈어요", ask: "숙제를 선생님께 내고 눌러주세요" },
];

/** 아직 안 누른 단계들 — done 은 { phone, attend, homework } (시각 또는 빈 값) */
export function leftOf(done = {}) {
  return STEPS.filter((s) => !done[s.kind]);
}
