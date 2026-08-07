/**
 * **쉬는 시간** — 언제 선생님께 알릴까.
 *
 * 원장님 (2026-08-07) — 「몇분 쉬었는지 기록하고 특이사항 있을때만 선생님
 * 대시보드에 알림 (반복적으로 5분이상이거나, 1회 10분이상일때)」
 *
 * ── 다 알리면 하나도 안 알리는 것과 같다 ──────────────────
 *
 * 한 반에 열 명이 하루 두 번씩 쉬면 스무 번이 울린다. 그러면 알림을
 * 꺼버리시게 되고, **정작 봐야 할 것까지 같이 죽는다.** 그래서 규칙을
 * 좁게 잡는다.
 *
 *   한 번에 10분 이상   →  한 번만으로도 알린다
 *   5분 이상이 두 번    →  「반복적으로」 가 그 뜻이다
 *
 * 두 규칙 다 **끝난 쉼**만 센다. 아직 안 돌아온 아이는 몇 분인지 모른다 —
 * 다만 지금 나가 있는 시간이 이미 10분을 넘었으면 그것도 센다
 * (돌아올 때까지 기다리면 늦다).
 *
 * 여기에는 **계산만** 둔다.
 */

export const LONG_MIN = 10;   // 한 번에 이만큼이면 그것만으로 알린다
export const OFTEN_MIN = 5;   // 이만큼짜리가
export const OFTEN_N = 2;     // 이만큼 되풀이되면

/** 시작 시각과 지금으로 몇 분인지 (아직 안 돌아온 아이) */
export function minutesSince(startedAt, now = Date.now()) {
  const t = new Date(startedAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60000));
}

/** 한 줄이 몇 분짜리인가 — 끝났으면 적힌 값, 아직이면 지금까지 */
export function minutesOf(row, now = Date.now()) {
  if (row?.minutes != null) return row.minutes;
  if (row?.ended_at) return minutesSince(row.started_at, new Date(row.ended_at).getTime());
  return minutesSince(row?.started_at, now);
}

/**
 * 오늘 이 아이의 쉼이 눈에 띄는가.
 *
 * @param rows 오늘 쉼 [{ started_at, ended_at, minutes }]
 * @returns null 이면 조용히 넘어간다. 아니면 { why, total, count, longest }
 */
export function notable(rows = [], now = Date.now()) {
  const mins = rows.map((r) => minutesOf(r, now));
  const total = mins.reduce((a, b) => a + b, 0);
  const longest = mins.length ? Math.max(...mins) : 0;
  const often = mins.filter((m) => m >= OFTEN_MIN).length;

  if (longest >= LONG_MIN) {
    return { why: `한 번에 ${longest}분`, total, count: rows.length, longest };
  }
  if (often >= OFTEN_N) {
    return { why: `${OFTEN_MIN}분 넘는 쉼이 ${often}번`, total, count: rows.length, longest };
  }
  return null;
}

/** 화면에 한 줄로 — 「3번 · 모두 24분 (제일 긴 것 12분)」 */
export function breakLine(rows = [], now = Date.now()) {
  if (rows.length === 0) return null;
  const mins = rows.map((r) => minutesOf(r, now));
  const total = mins.reduce((a, b) => a + b, 0);
  const longest = Math.max(...mins);
  return `${rows.length}번 · 모두 ${total}분${rows.length > 1 ? ` (제일 긴 것 ${longest}분)` : ""}`;
}
