import { DOW } from "./day.js";
// 공휴일 · 대체공휴일 · 연휴 판단
//
// 우리가 하는 일은 **결정이 아니라 알림**이다.
//   "5/5 어린이날이 수업일입니다. 쉬시겠습니까?"  ← 원장이 정한다
// 자동으로 휴강 처리하지 않는다. 학원마다 다르고, 낀 날은 더 그렇다.
//
// 음력 공휴일(설날·추석·석가탄신일)은 계산으로 못 구하므로 해마다 적어둔다.
// 새 해가 오면 아래 LUNAR 에 세 줄만 추가하면 된다.

const FIXED = [
  ["01-01", "신정"],
  ["03-01", "삼일절"],
  ["05-05", "어린이날"],
  ["06-06", "현충일"],
  ["08-15", "광복절"],
  ["10-03", "개천절"],
  ["10-09", "한글날"],
  ["12-25", "성탄절"],
];

// 해마다 바뀌는 것 — 연휴는 [시작, 끝] 로 적는다
const LUNAR = {
  2026: {
    설날: ["2026-02-16", "2026-02-18"],
    석가탄신일: ["2026-05-24", "2026-05-24"],
    추석: ["2026-09-24", "2026-09-26"],
  },
  2027: {
    설날: ["2027-02-06", "2027-02-08"],
    석가탄신일: ["2027-05-13", "2027-05-13"],
    추석: ["2027-09-14", "2027-09-16"],
  },
};

function dowOf(d) {
  return DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
}
function add(d, n) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
function isWeekend(d) {
  const w = dowOf(d);
  return w === "토" || w === "일";
}

/**
 * 대체공휴일 규칙 (2026 기준)
 *   설날·추석      : 연휴가 일요일과 겹치면 그만큼 뒤로 민다
 *   어린이날       : 토·일과 겹치면 다음 평일
 *   삼일절·광복절·개천절·한글날·성탄절·석가탄신일 : 토·일과 겹치면 다음 평일
 *   신정·현충일    : 대체공휴일 없음
 * 규칙이 애매한 해가 있으므로, 밀어낸 날은 `substitute: true` 로 표시해서
 * 화면에서 "확인해주세요" 라고 알린다.
 */
const NO_SUBSTITUTE = new Set(["신정", "현충일"]);

/** 그 해 공휴일 전부 */
export function holidaysOf(year) {
  const out = [];
  const taken = new Set();

  const push = (date, name, extra = {}) => {
    out.push({ date, name, ...extra });
    taken.add(date);
  };

  FIXED.forEach(([md, name]) => push(`${year}-${md}`, name));

  const lunar = LUNAR[year];
  if (lunar) {
    Object.entries(lunar).forEach(([name, [from, to]]) => {
      for (let d = from; d <= to; d = add(d, 1)) push(d, name);
    });
  }

  // 대체공휴일
  const subs = [];
  out.forEach((h) => {
    if (NO_SUBSTITUTE.has(h.name)) return;
    const isLunarRun = lunar && lunar[h.name];
    // 설날·추석은 일요일만, 나머지는 토·일 둘 다 밀린다
    const collides = isLunarRun ? dowOf(h.date) === "일" : isWeekend(h.date);
    if (!collides) return;
    let d = add(h.date, 1);
    while (taken.has(d) || isWeekend(d) || subs.some((s) => s.date === d)) d = add(d, 1);
    subs.push({ date: d, name: `${h.name} 대체공휴일`, substitute: true, from: h.date });
  });
  subs.forEach((s) => out.push(s));

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 공휴일 사이에 낀 평일 (연차 하루면 길게 쉬는 날)
 * 예: 목요일이 공휴일이고 토·일이 이어지면 금요일이 "낀 날"
 */
export function bridgeDays(year) {
  const hs = new Set(holidaysOf(year).map((h) => h.date));
  const out = [];
  for (let d = `${year}-01-01`; d.startsWith(String(year)); d = add(d, 1)) {
    if (hs.has(d) || isWeekend(d)) continue;
    const before = hs.has(add(d, -1)) || isWeekend(add(d, -1));
    const after = hs.has(add(d, 1)) || isWeekend(add(d, 1));
    if (before && after) out.push(d);
  }
  return out;
}

/**
 * 앞으로 다가오는 것 중 **내가 판단해야 하는 것**만 추린다.
 *
 * @param classDates 반들이 실제로 수업하는 날짜 Set (보강 전용 요일은 이미 빠진 상태)
 * @param decided    이미 휴강으로 지정했거나 일정에 넣어둔 날짜 Set
 * @returns [{ date, name, kind, why }]
 *   kind: holiday(공휴일이 수업일) | substitute(대체공휴일 — 규칙 확인) | bridge(낀 날)
 */
export function holidayAlerts(from, to, classDates, decided = new Set()) {
  const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])].map(Number);
  const alerts = [];

  years.forEach((y) => {
    holidaysOf(y).forEach((h) => {
      if (h.date < from || h.date > to) return;
      if (decided.has(h.date)) return;
      if (!classDates.has(h.date)) return;      // 어차피 수업 없는 날은 알릴 것 없음
      alerts.push({
        date: h.date,
        name: h.name,
        kind: h.substitute ? "substitute" : "holiday",
        why: h.substitute
          ? `${h.from.slice(5)} ${h.name.replace(" 대체공휴일", "")}가 주말과 겹쳐 이 날로 밀렸습니다. 학교마다 다를 수 있으니 확인해주세요.`
          : `${h.name}인데 수업일입니다. 쉴지 그대로 할지 정해주세요.`,
      });
    });

    bridgeDays(y).forEach((d) => {
      if (d < from || d > to) return;
      if (decided.has(d) || !classDates.has(d)) return;
      alerts.push({
        date: d,
        name: "연휴 사이 낀 날",
        kind: "bridge",
        why: "앞뒤가 공휴일·주말",
      });
    });
  });

  return alerts.sort((a, b) => a.date.localeCompare(b.date));
}
