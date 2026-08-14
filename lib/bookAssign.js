// 교재 배정을 **넣고 빼는 규칙** — 한 곳에만 둔다.
//
// 배정은 두 쪽에서 손댄다.
//   학생 쪽에서   이 학생이 쓰는 교재를 고른다   (재원생 · 오늘 수업)
//   교재 쪽에서   이 교재를 쓰는 학생을 고른다   (교재 · 단원)
//
// 어느 쪽에서 고치든 **같은 표(student_textbooks) 의 같은 줄**이다. 규칙을
// 양쪽에 따로 적으면 한쪽만 고쳐진다 — 교재 화면에서 뺀 학생이 오늘 수업에는
// 그대로 남아 있는 식이다. 그런 어긋남은 오류가 안 나고 조용하다.
//
// 그래서 **무엇을 넣고 무엇을 뺄지 고르는 일**만 여기서 하고,
// 줄을 실제로 쓰는 것은 app/progress/actions.js 가 한다.

/**
 * 지금 붙어 있는 것(have)과 원하는 것(want)을 견줘 **넣을 것과 뺄 것**을 가린다.
 *
 * @param have [{ id, status }]  지금 붙어 있는 상대쪽 id 와 그 상태
 *                               (학생 쪽에서 부르면 id 는 교재, 교재 쪽이면 학생)
 * @param want [id]              이렇게 되어야 한다
 *
 * @returns {{ add: [{id, known}], drop: [id] }}
 *   add.known  전에 한 번 붙였다 뗀 것인가.
 *              **처음 붙이는 것만 「오늘부터」로 적는다** — 다시 넣는 것은
 *              쓰기 시작한 날이 이미 있으니 건드리면 안 된다.
 *   drop       뺄 것. **지우지 않는다** — 지우면 지금까지 나간 진도가 같이
 *              사라진다. '중단' 으로 돌려서 배정·진도 화면에서만 빠지고,
 *              기록에는 남는다. 다시 넣으면 이어서 간다.
 */
export function planAssign(have, want) {
  const wanted = [...new Set((want || []).filter(Boolean))];
  const rows = have || [];
  const known = new Set(rows.map((r) => r.id));
  const active = new Set(
    rows.filter((r) => !r.status || r.status === "active").map((r) => r.id)
  );

  const add = wanted
    .filter((id) => !active.has(id))
    .map((id) => ({ id, known: known.has(id) }));
  const drop = [...active].filter((id) => !wanted.includes(id));

  return { add, drop };
}

/**
 * **날짜를 정해서 넣는 배정 — 이미 있는 짝은 뺀다.**
 *
 * `planAssign` 과 다른 자리다. 저건 "이 학생이 지금 쓰는 교재 전체를
 * 이 목록으로 맞춘다"(재원생·교재 화면의 교체)이고, 이건 "이 (학생,교재)
 * 짝에 이 날짜로 새로 꽂는다"(교재 안내 보내기 · 교재안내 기록 이관)다.
 * 두 자리(app/report/noticeActions.js assignAnnouncedBooks ·
 * app/import/actions.js importBookGuide) 가 「이미 배정된 것은 건드리지
 * 않는다」 는 같은 판단을 따로 적고 있었다 — 여기 하나로 모은다.
 *
 * 시작일을 다시 쓰면 지금까지 나간 진도가 다른 날부터 시작한 것처럼 보여서
 * 이미 있는 짝은 절대 건드리지 않는다.
 *
 * @param have Set<string>  이미 있는 짝, "student_id|textbook_id"
 * @param wants [{ studentId, textbookId, date }]  넣고 싶은 것
 * @returns [{ studentId, textbookId, date }]  실제로 넣을 것만
 */
export function planDatedAssign(have, wants) {
  return (wants || []).filter((w) => !have.has(`${w.studentId}|${w.textbookId}`));
}
