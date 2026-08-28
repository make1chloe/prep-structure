/**
 * **오늘 배운 것 — 하원 길목의 잣대 한 벌** (0181).
 *
 * 적는 칸(LearnedBox)과 막는 단추(LeaveCard)가 **같은 것**을 봐야 한다.
 * 두 벌이면 「다 적었는데 하원이 안 눌린다」 가 생긴다 (원칙 1).
 *
 * 원장님: 「**반드시**」 — 안 적으면 하원을 못 누른다 (길목, NoticeGate 선례).
 * 그렇다고 아이를 가둘 일은 아니다. **짧게 한 줄이면 된다.**
 * 다섯 글자 — 「관계대명사」·「to부정사」 가 통과하는 길이다.
 */
export const LEARNED_MIN = 5;

/** 이만큼 적었으면 하원해도 된다 */
export function learnedEnough(body) {
  return String(body || "").trim().length >= LEARNED_MIN;
}

/**
 * 아직 못 지나갈 때 **무엇을 하면 되는지** 말해준다.
 * 「안 됨」 만 말하고 끝내지 않는다 (A4 — 막다른 태그는 실패다).
 */
export const LEARNED_ASK = "오늘 배운 것을 한 줄만 적으면 하원할 수 있어요";
