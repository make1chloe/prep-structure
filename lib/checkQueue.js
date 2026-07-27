// 검사 대기 — 학생이 누르는 버튼 없이
//
// 학생에게 "검사 받을게요" 버튼을 주면, 안 누르고 넘어간 아이를 또 못 잡는다.
// 그래서 **행동으로 알아낸다.**
//
//   검사가 필요한 항목(타이머 없는 것)이 아직 검사 안 됐는데,
//   그보다 **뒤 순서 항목의 타이머가 이미 돌았다**  →  지나쳐 간 것이다.
//
// 학생은 아무것도 안 해도 되고, 선생님 화면에만 뜬다.

/**
 * @param items   [{ id, name, sort, no_timer }]  학습 항목 마스터
 * @param toCheck [itemId]                        오늘 검사할 것 (아직 결과 없는 것)
 * @param marks   { itemId: "done"|"weak"|"missing" }  지금 화면에서 찍은 것
 * @param started [{ homework_item_id, started_at }]   오늘 돌린 타이머
 * @returns [{ id, name, since }]  since = 지나친 시각(ISO)
 */
export function waitingChecks(items = [], toCheck = [], marks = {}, started = []) {
  const byId = new Map(items.map((i) => [i.id, i]));

  // 아직 검사 안 한 '검사 항목'
  const pending = toCheck
    .map((id) => byId.get(id))
    .filter((i) => i && i.no_timer && !marks[i.id]);
  if (pending.length === 0) return [];

  // 오늘 타이머를 돌린 항목들 — 언제 시작했는지와 함께
  const runs = started
    .map((s) => ({ item: byId.get(s.homework_item_id), at: s.started_at }))
    .filter((x) => x.item);
  if (runs.length === 0) return [];

  return pending
    .map((i) => {
      // 이 항목보다 뒤에 있는 것을 시작했다면, 그때 지나친 것이다
      const passed = runs
        .filter((x) => (x.item.sort ?? 500) > (i.sort ?? 500))
        .sort((a, b) => a.at.localeCompare(b.at))[0];
      return passed ? { id: i.id, name: i.name, since: passed.at } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.since.localeCompare(b.since));
}

/** "8분째" — 얼마나 기다리고 있나 */
export function waitingFor(since, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(since).getTime()) / 60000));
  if (m < 60) return `${m}분째`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분째`;
}
