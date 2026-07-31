// 달력 한 판
//
// 목록은 "무엇이 있나" 를 보여주지만 "언제 몰려 있나" 는 안 보여준다.
// 시험 주간에 일정이 세 개 겹치는 것, 다음 주가 통째로 비는 것은
// 달력으로 봐야 보인다.
//
// 여기서는 **칸을 만들기만** 한다. 무엇을 어떻게 그릴지는 화면이 정한다.

import { dowOf } from "./day.js";

export const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 그 달의 달력 칸 — 앞뒤로 빈칸을 채워 항상 7칸씩 떨어지게 만든다.
 *
 * @param ym    "2026-08"
 * @param items [{ date, ... }]  날짜(YYYY-MM-DD)를 가진 것이면 무엇이든
 * @param today 오늘 (지난 날을 흐리게 하려고)
 * @returns [{ date, day, dow, past, today, items:[] }]  빈칸은 null
 */
export function monthGrid(ym, items = [], today = "") {
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const byDate = new Map();
  items.forEach((it) => {
    const d = (it.date || "").slice(0, 10);
    if (!d.startsWith(ym)) return;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(it);
  });

  const cells = [];
  // 1일이 무슨 요일인지에 맞춰 앞을 비운다
  const lead = DOW.indexOf(dowOf(first));
  for (let i = 0; i < lead; i += 1) cells.push(null);

  for (let d = 1; d <= lastDay; d += 1) {
    const date = `${ym}-${String(d).padStart(2, "0")}`;
    cells.push({
      date,
      day: d,
      dow: dowOf(date),
      past: !!today && date < today,
      today: date === today,
      items: byDate.get(date) || [],
    });
  }
  // 마지막 줄도 7칸을 채운다 (안 채우면 칸이 늘어나 보인다)
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

/** 한 달에 무엇이 몇 건인가 — 달력 위에 요약으로 적는다 */
export function countBy(items = [], key = "kind") {
  const out = {};
  items.forEach((it) => {
    const k = it[key] || "기타";
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}
