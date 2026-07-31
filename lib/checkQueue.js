// 검사 대기
//
// 학생은 '검사 받을게요' 를 따로 누르지 않는다.
// **학습 완료를 누르는 것이 곧 검사 대기**다 — 다 했으니 봐달라는 뜻이니까.
//
// 그래서 대기줄은 짐작이 아니라 기록이다.
//   학생이 완료를 눌렀고(student_done_at) + 선생님이 아직 안 찍었으면 → 대기 중
//
// 선생님은 손이 빌 때 대기줄을 보고 한꺼번에 검사한다.
// 바빠서 "그냥 넘어가" 라고 해도 검사 안 한 항목은 다음 수업으로 넘어가므로
// 잊어버리지 않는다.

/**
 * @param rows  [{ homework_item_id, status, student_done_at }] 오늘 리포트 항목
 * @param items [{ id, name, sort }] 학습 항목 마스터
 * @param marks { itemId: "done"|"weak"|"missing" } 지금 화면에서 찍은 것
 * @returns [{ id, name, since }] 오래 기다린 것부터
 */
export function waitingChecks(rows = [], items = [], marks = {}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return rows
    .filter((r) => r.student_done_at && !marks[r.homework_item_id])
    .map((r) => ({
      id: r.homework_item_id,
      name: byId.get(r.homework_item_id)?.name || "학습",
      since: r.student_done_at,
    }))
    // 같은 항목이 두 줄로 잡히면 하나로
    .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
    .sort((a, b) => a.since.localeCompare(b.since));
}

/**
 * 반 전체 대기줄의 순서.
 *
 * 그냥 오래 기다린 순으로 늘어놓으면, 한 학생이 다섯 개를 한꺼번에 끝냈을 때
 * 화면 위쪽이 그 학생으로만 찬다. 다른 아이들은 기다리는 줄도 안 보인다.
 *
 * 그래서 **학생을 한 바퀴씩 돈다.** 각 학생의 제일 오래 기다린 것을 먼저 한 줄씩,
 * 그다음 두 번째 것을 한 줄씩. 학생 사이의 순서는 여전히 오래 기다린 순이다.
 *
 * @param queue [{ student, id, since }]
 */
export function orderQueue(queue = []) {
  const byStudent = new Map();
  [...queue]
    .sort((a, b) => a.since.localeCompare(b.since))
    .forEach((q) => {
      const k = q.student?.id || "?";
      if (!byStudent.has(k)) byStudent.set(k, []);
      byStudent.get(k).push(q);
    });

  // 제일 오래 기다린 학생부터 한 바퀴씩
  const lines = [...byStudent.values()].sort((a, b) => a[0].since.localeCompare(b[0].since));
  const out = [];
  for (let i = 0; out.length < queue.length; i += 1) {
    let moved = false;
    lines.forEach((l) => {
      if (l[i]) { out.push(l[i]); moved = true; }
    });
    if (!moved) break; // 안전장치
  }
  return out;
}

/** "8분째" — 얼마나 기다리고 있나 */
export function waitingFor(since, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(since).getTime()) / 60000));
  if (m < 60) return `${m}분째`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분째`;
}
