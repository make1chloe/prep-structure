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
 * 기간 일정을 **날마다 펼친다.**
 *
 * 방학·시험기간은 한 줄로 저장한다 (8/1 ~ 8/16 여름방학). 목록에서는 그게 맞다 —
 * 서른 줄로 늘어놓으면 다른 일정이 안 보인다.
 *
 * 그런데 달력은 반대다. 8월 10일 칸이 비어 있으면 그날은 방학이 아닌 줄 안다.
 * **저장은 한 줄로, 달력에서는 날마다.**
 *
 * 너무 긴 것은 잘라둔다 — 겨울방학처럼 두 달짜리가 있으면 달력 칸이 그것만으로
 * 찬다. 여기서는 한 화면(약 두 달)만 펼친다.
 */
export function expandRanges(items = [], max = 70) {
  const out = [];
  items.forEach((it) => {
    const from = (it.date || "").slice(0, 10);
    const to = (it.endDate || "").slice(0, 10);
    if (!from) return;
    if (!to || to <= from) { out.push(it); return; }
    let d = from;
    for (let i = 0; i < max && d <= to; i += 1) {
      out.push({ ...it, date: d, spanFrom: from, spanTo: to });
      const x = new Date(`${d}T00:00:00Z`);
      x.setUTCDate(x.getUTCDate() + 1);
      d = x.toISOString().slice(0, 10);
    }
  });
  return out;
}

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

/**
 * **같은 날 같은 것이 여러 줄로 뜨던 것을 하나로** (원장님, 2026-08-07 — 「중복이 있어」).
 *
 * 8월 17일에 이렇게 셋이 있었다.
 *
 *   광복절 대체공휴일 — 정상 수업     ← 원장님이 정하신 것 (할일·일정)
 *   [전국] 대체공휴일                  ← 나이스 학사일정
 *   🚫 대체공휴일                      ← 휴강 표
 *
 * 셋 다 **같은 하루를 말한다.** 각자 다른 표에서 왔으니 코드가 보기에는
 * 다른 줄이지만, 달력을 보는 사람에게는 한 가지 일이다. 세 줄이 차지하면
 * 그날 정말 봐야 할 보강·상담이 「+2」 뒤로 밀린다.
 *
 * ── 무엇을 남기나 ────────────────────────────────────────
 *
 * **더 많이 말해주는 것**을 남긴다. 「정상 수업」 은 원장님이 정하신 결과라
 * 「대체공휴일」 보다 아는 것이 많다. 휴강도 마찬가지다 — 그날 수업이
 * 없다는 뜻까지 담고 있다.
 *
 * 이름이 조금이라도 다르면 안 합친다. 「대체공휴일」 과 「개교기념일」 이
 * 같은 날 있을 수 있고, 그건 정말 두 가지다.
 */
export function baseTitle(t = "") {
  return (t || "")
    .replace(/^\[[^\]]*\]\s*/, "")          // [전국]
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]+\s*/u, "")  // 🚫 ⛔ ✅ …
    .split(/\s+[—–-]\s+/)[0]                 // 「… — 정상 수업」 의 앞부분
    .trim();
}

/**
 * @param items [{ date, title, ... }]
 * @param rank  (item) => 숫자. 큰 것이 남는다 (같으면 먼저 온 것)
 */
export function dedupeSameDay(items = [], rank = () => 0) {
  const best = new Map();
  const order = [];
  let n = 0;
  items.forEach((it) => {
    const name = baseTitle(it.title);
    // **이름이 없으면 아무와도 안 합친다.** 빈 이름끼리 묶으면 서로 다른
    // 것이 하나로 뭉개진다 — 무엇이 사라졌는지도 알 수 없게 된다
    const key = name
      ? `${(it.date || "").slice(0, 10)}|${name}`
      : `#${n++}`;
    if (best.has(key)) {
      if (rank(it) > rank(best.get(key))) best.set(key, it);
      return;
    }
    best.set(key, it);
    order.push(key);
  });
  return order.map((k) => best.get(k));
}
