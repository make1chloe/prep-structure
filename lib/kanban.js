/**
 * **할일 칸반이 카드를 어느 칸에, 어느 차례로 놓는가** (0113).
 *
 * 화면(TodoKanban)에서 떼어 둔다. 화면 안에 있으면 눈으로 볼 수만 있고
 * **검사할 수가 없다.** 여기 있으면 scripts/check-kanban.mjs 가 못을 박는다.
 */

/**
 * 「할 것」 칸에 바로 올릴 것.
 *
 * 원장님 할일은 스무 개가 넘고, 그중에는 **반복 루틴이 자동으로 만든 것**도
 * 섞인다. 전부 한 칸에 세우면 카드 스무 장이 쌓여서, 칸반이 「좁은 칸에
 * 갇힌 목록」 이 된다. 그래서 코앞의 것만 올리고 나머지는 접어둔다.
 *
 * 접는 기준은 **마감이 이레 안**이거나 **급함**. 급한 것은 마감이 멀어도
 * 올린다 — 급하다고 적어두신 뜻이 그것이다.
 */
export function isSoon(t = {}, now, week) {
  if ((t.priority || 0) >= 2) return true;
  if (t.no_due || !t.due_on) return false;
  return t.due_on <= week;
}

/**
 * **날짜가 먼저, 중요도는 그다음.**
 *
 * 처음엔 중요도를 앞에 뒀다. 그랬더니 「오늘 마감인 보통 일」 이 「이레 뒤
 * 마감인 중요한 일」 **아래**로 내려갔다 (화면으로 보고서야 알았다).
 * 오늘 해야 하는 것이 아래에 있으면 그건 틀린 목록이다.
 */
export function band(t = {}, now) {
  if (t.no_due || !t.due_on) return 3;   // 마감 없음 — 맨 뒤
  if (t.due_on < now) return 0;          // 지났다
  if (t.due_on === now) return 1;        // 오늘까지
  return 2;
}

export function byUrgency(now) {
  return (a, b) => {
    const ba = band(a, now);
    const bb = band(b, now);
    if (ba !== bb) return ba - bb;
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    return (a.due_on || "9999-99-99").localeCompare(b.due_on || "9999-99-99");
  };
}

/**
 * 칸반 세 칸을 한 번에 나눈다.
 *
 * `started` 는 0113 이 돌았는가다. 안 돌았으면 「하는 중」 칸이 아예 없고,
 * 손댄 것 없이 두 칸(할 것 · 끝냄)으로 선다 — 칸은 없는데 카드만 사라지는
 * 일이 있으면 안 되므로, 그때는 전부 「할 것」 에 남는다.
 */
export function split({ todos = [], catId = "", now, week, started = true }) {
  const mine = todos.filter((t) => !catId || t.todo_category_id === catId);
  const sort = byUrgency(now);

  const doing = started ? mine.filter((t) => t.status === "open" && t.started_at) : [];
  const rest = mine.filter((t) => t.status === "open" && !(started && t.started_at));

  const todo = rest.filter((t) => isSoon(t, now, week)).sort(sort);
  const later = rest.filter((t) => !isSoon(t, now, week)).sort(sort);

  /**
   * **끝낸 칸은 오늘 것만.** 지난달에 끝낸 것까지 세우면 칸반이 무덤이 된다.
   * 그동안 처리한 일은 달력에서 본다.
   */
  const doneToday = mine
    .filter((t) => t.status === "done" && (t.done_at || "").slice(0, 10) === now)
    .sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""));

  return {
    doing: doing.sort(sort),
    todo,
    later,
    doneToday,
    doneAll: mine.filter((t) => t.status === "done").length,
  };
}
