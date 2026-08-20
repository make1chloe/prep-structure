/**
 * **알림 배치 규칙** (원장님, 2026-08-21 — 「항상 모든 알림은 확정 버튼을
 * 누르고, 그다음 일정한 시간에 발송한다는 규칙」 · 시각은 「매시 정각,
 * 필요시 추가」 · 예외는 하원 안내와 발송 화면의 직접 보내기).
 *
 * 자동으로 생기는 알림(오늘 할 일 바뀜 · 전달사항 확인/조정 · 보강
 * 변경 …)은 즉시 쏘지 않고 예약 발송(0126 scheduled_sends, kind 'push')에
 * 담는다 — 다음 정각에 나가고, 그 전엔 발송 「보낼 것」 예약 목록에서
 * 보이고 취소할 수 있다. 같은 집에 몰린 알림은 정각에 한 통으로 합쳐진다.
 */

/** 다음 정각(서울) — 확정 직후 최소 1분의 무르기 여유는 보장한다 */
export function nextHourSeoul(now = new Date()) {
  const d = new Date(now.getTime());
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  if (d.getTime() - now.getTime() < 60 * 1000) d.setHours(d.getHours() + 1);
  return d.toISOString();
}

/**
 * 알림을 대기함에 담는다.
 * @param payload { studentIds, who: 'all'|'parent'|'student', title, body, url }
 * @param note 예약 목록에 보일 한 줄 (누구 · 무엇)
 */
export async function queuePush(supabase, payload, note) {
  const row = {
    kind: "push",
    due_at: nextHourSeoul(),
    payload,
    note: note || payload?.title || "앱 알림",
  };
  const { error } = await supabase.from("scheduled_sends").insert(row);
  return { error: error?.message || null };
}
