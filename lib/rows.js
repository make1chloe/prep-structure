/**
 * **여러 줄을 한 번에 넣을 때는 줄마다 칸이 같아야 한다** (2026-08-24).
 *
 * 원장님이 폰에서 「임시저장」 을 눌렀을 때 터진 것:
 *
 *   null value in column "carry_next" of relation "daily_report_items"
 *   violates not-null constraint
 *
 * 왜냐면 — 한 번에 넣는 줄들이 서로 **다른 칸을 들고 있었다.**
 * 등원 학습 줄만 `carry_next` 를 들고, 숙제 검사·배정 줄은 안 들었다.
 * PostgREST 는 이럴 때 **없는 칸을 NULL 로 채운다.** 「칸의 기본값(false)」
 * 이 아니라 NULL 이다. 그래서 `not null` 인 칸에서 통째로 거절당한다.
 *
 * 무서운 것은 **조건이 맞아야만 터진다**는 점이다 — 등원 학습이 한 줄이라도
 * 있고, 동시에 숙제 줄도 있어야 한다. 등원 학습만 있으면 멀쩡하고, 아예
 * 없어도 멀쩡하다. 그래서 검사도 통과하고 며칠을 살아 있었다.
 *
 * 고침: 넣기 전에 **모든 줄의 칸을 같은 벌로 맞춘다.** 없던 칸은 `defaults`
 * 에 적어둔 값으로, 안 적었으면 null 로 채운다. 새 `not null` 칸이 생기면
 * 여기 defaults 에 한 줄 더하면 된다.
 *
 * @param rows     넣을 줄들
 * @param defaults 그 칸이 없는 줄에 넣어줄 값 { carry_next: false, ... }
 */
export function evenRows(rows, defaults = {}) {
  if (!Array.isArray(rows) || rows.length < 2) return rows;
  const keys = new Set();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  return rows.map((r) => {
    const out = {};
    for (const k of keys) {
      out[k] = k in r ? r[k] : (k in defaults ? defaults[k] : null);
    }
    return out;
  });
}
