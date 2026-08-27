// 내신 자료를 순서대로 낸다
//
// 교재에 루틴이 있듯 내신 자료에도 순서가 있다.
//   이그잼 변형문제 → 분석지 → 워크북
//
// 순서는 세 겹으로 정해진다. 앞의 것이 먼저다.
//   1. 학생 배정에 직접 매긴 순서      (그 학생만 다르게)
//   2. 자료에 매긴 순서                (범위 안에서)
//   3. 종류에 매긴 순서                (기본 루틴)
// 그리고 같은 순서면 **시험일이 급한 것**부터다.

/**
 * 지금 무슨 단계인가 — 화면에 한 줄로 보여줄 말.
 * 자료마다 켜둔 단계만 본다 (분석지는 채점이 없다).
 */
export function stageOf(a = {}) {
  if (a.need_make && !a.made_at) return { key: "make", label: "만들기" };
  if (a.need_print && !a.printed_at) return { key: "print", label: "인쇄" };
  if (a.need_card && !a.card_at) return { key: "card", label: "클래스카드" };
  if (a.need_hand && !a.handed_at) return { key: "hand", label: "배부" };
  if (a.need_solve && !a.solved_at) return { key: "solve", label: "풀이" };
  if (a.need_grade && !a.graded_at) return { key: "grade", label: "채점" };
  return null;
}
