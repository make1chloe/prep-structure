/**
 * **「지금 때」 판정식** (판세분화 v7 §5-4 — 문자 그대로):
 *
 *   기본값 제안일 뿐(◂▸ 자유·② 미완이어도 ③ 진입).
 *   미검사 n>0→① / 등원 학습 미완→② / 그 외→③.
 *
 * 줄의 「열기」 가 판을 열 때 어느 때부터 보일지만 제안한다.
 * 칩(검사·수업·다음)은 이 판정을 안 거친다 — 누른 그 때로 직행.
 * 수업 흐름과 무관하게 언제든 다른 때로 옮길 수 있다.
 */
export function defaultSheetTab(row) {
  const marks = row.items || {};
  // ① 검사 — 지난 수업 숙제 중 아직 판정 안 한 것이 남았다
  if ((row.toCheck || []).some((id) => !marks[id])) return "check";
  // ② 수업 — 오늘 등원 학습 목록에 「다 했어요」 안 된 것이 남았다
  const done = new Set(
    (row.doneRows || [])
      .filter((d) => d.student_done_at)
      .map((d) => d.homework_item_id)
  );
  if ((row.inClass || []).some((id) => !done.has(id))) return "lesson";
  // ③ 다음 — 검사도 등원 학습도 끝났다
  return "next";
}
