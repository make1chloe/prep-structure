// 흐름 — 나아지고 있나
//
// 숫자 하나만 보면 그날 운이 좋았는지 나빠졌는지 알 수 없다.
// **자기 지난 기록과 견주어** 오르는 중인지 유지인지 보여준다.
//
// 남과 비교하지 않는다. 개별진도 학원에서 옆 친구와의 비교는 도움이 안 되고,
// 무엇보다 **빠른 게 좋은 것도 아니다** — 대충 하면 빨라진다.
//
// 그래서 화살표는 **성취도에만** 붙인다. 소요 시간에는 안 붙인다.
// 시간이 줄었다고 좋아진 것도, 늘었다고 나빠진 것도 아니기 때문이다.

/**
 * 최근 몇 회와 그 이전을 견준다.
 * @param values 오래된 것부터의 값들 (성취도 %)
 * @param recent 최근 몇 회를 '지금' 으로 볼지
 * @returns { now, before, diff, dir: "up"|"down"|"flat", arrow, label } | null
 */
export function trend(values = [], recent = 3, flatWithin = 3) {
  const v = values.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (v.length < 2) return null;

  const cut = Math.max(1, Math.min(recent, v.length - 1));
  const tail = v.slice(-cut);
  const head = v.slice(0, -cut);
  if (head.length === 0) return null;

  const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  const now = avg(tail);
  const before = avg(head);
  const diff = now - before;

  const dir = Math.abs(diff) <= flatWithin ? "flat" : diff > 0 ? "up" : "down";
  return {
    now,
    before,
    diff,
    dir,
    arrow: dir === "up" ? "▲" : dir === "down" ? "▼" : "―",
    label: dir === "up" ? "오르는 중" : dir === "down" ? "내려가는 중" : "유지",
  };
}

/** 평균 소요 시간 (초) — 화살표 없이 값만 쓴다 */
export function avgSeconds(list = []) {
  const v = list.filter((x) => x > 0);
  if (v.length === 0) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}
