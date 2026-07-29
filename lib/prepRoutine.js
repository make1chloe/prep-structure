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

/** 배정 한 건의 순서값 — 작을수록 먼저 */
export function orderOf(a = {}) {
  if (Number.isFinite(a.sort)) return a.sort;
  if (Number.isFinite(a.materialSort)) return a.materialSort;
  if (Number.isFinite(a.typeSort)) return a.typeSort;
  return 9999;
}

/** 아직 안 끝난 것만, 낼 순서대로 */
export function queueFor(assignments = []) {
  return assignments
    .filter((a) => !a.graded_at)
    .sort(
      (x, y) =>
        (x.examDate || "9999-12-31").localeCompare(y.examDate || "9999-12-31") ||
        orderOf(x) - orderOf(y) ||
        (x.name || "").localeCompare(y.name || "", "ko")
    );
}

/**
 * 지금 이 학생에게 낼 것 하나.
 *
 * 한 번에 하나씩 낸다. 여러 개를 한꺼번에 주면 아이가 고르다가 시간을 쓴다
 * (등원 학습과 같은 원칙이다).
 */
export function nextFor(assignments = []) {
  return queueFor(assignments)[0] || null;
}

/** 어디까지 왔나 — 끝낸 것 / 전체 */
export function progressOf(assignments = []) {
  const total = assignments.length;
  const done = assignments.filter((a) => a.graded_at).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : null };
}

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
