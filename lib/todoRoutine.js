// 되풀이되는 할일 — 언제 뜨는가
//
// 규칙만 적어두고, 실제 할일은 날짜가 오면 저절로 만들어진다.
// 「이번 달 수강료 안내 했나」 를 기억하고 있을 필요가 없어야 한다.

import { addDays, dowOf, endOfMonth } from "./day.js";

export const KINDS = [
  { key: "weekly", label: "매주" },
  { key: "monthly", label: "매달" },
  { key: "yearly", label: "매년" },
];

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * **그 달의 며칠인가.**
 *
 * 31일로 적어두면 2월에는 28(29)일이 된다. 「말일에 마감」 을 31 로 적으시는
 * 것이 자연스러운데, 그걸 그대로 두면 2·4·6·9·11월에는 아예 안 뜬다.
 */
export function clampDay(ym, day) {
  const last = Number(endOfMonth(ym).slice(8, 10));
  const d = Number(day);
  if (!Number.isFinite(d) || d < 1) return null;
  return Math.min(d, last);
}

/**
 * [from, to] 안에서 이 규칙이 걸리는 날들.
 *
 * @param r    { repeat_kind, dows, day_of_month, month }
 * @param from "YYYY-MM-DD"
 * @param to   "YYYY-MM-DD"
 */
export function occurrences(r = {}, from, to) {
  if (!from || !to || from > to) return [];
  const out = [];

  if (r.repeat_kind === "weekly") {
    const want = new Set((r.dows || []).filter((d) => DOW.includes(d)));
    if (want.size === 0) return [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (want.has(dowOf(d))) out.push(d);
    }
    return out;
  }

  if (r.repeat_kind === "monthly") {
    // 달마다 하루씩만 본다 — 날짜를 하나하나 훑을 까닭이 없다
    let ym = from.slice(0, 7);
    const lastYm = to.slice(0, 7);
    while (ym <= lastYm) {
      const day = clampDay(ym, r.day_of_month);
      if (day) {
        const d = `${ym}-${String(day).padStart(2, "0")}`;
        if (d >= from && d <= to) out.push(d);
      }
      ym = nextYm(ym);
    }
    return out;
  }

  if (r.repeat_kind === "yearly") {
    const m = Number(r.month);
    if (!Number.isFinite(m) || m < 1 || m > 12) return [];
    const y0 = Number(from.slice(0, 4));
    const y1 = Number(to.slice(0, 4));
    for (let y = y0; y <= y1; y += 1) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const day = clampDay(ym, r.day_of_month);
      if (!day) continue;
      const d = `${ym}-${String(day).padStart(2, "0")}`;
      if (d >= from && d <= to) out.push(d);
    }
    return out;
  }

  return [];
}

function nextYm(ym) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * 같은 되풀이가 두 번 생기지 않게 하는 열쇠.
 * tasks.auto_key 는 통째로 유일하다 (0061).
 */
export function autoKey(routineId, date) {
  return `routine:${routineId}:${date}`;
}

/**
 * 지금 만들어 둬야 할 할일들.
 *
 * **미리 띄우는 날(lead_days)** 만큼 앞당겨 뜬다. 수강료 안내처럼 준비가
 * 필요한 것은 당일 아침에 알아봐야 늦다. 마감은 규칙에 적힌 그날이다.
 *
 * @param routines  todo_routines 줄들
 * @param today     "YYYY-MM-DD"
 * @param horizon   며칠 앞까지 미리 만들어 둘까 (기본 60일)
 * @returns [{ auto_key, title, due_on, todo_category_id, priority, note }]
 */
export function dueTasks(routines = [], today, horizon = 60) {
  const out = [];
  for (const r of routines) {
    if (r.active === false) continue;
    const lead = Math.max(0, Number(r.lead_days) || 0);
    // 마감이 오늘보다 lead 만큼 뒤까지인 것을 만든다.
    // 지난 것은 안 만든다 — 이미 지나간 달의 할일이 오늘 새로 생기면 안 된다.
    const to = addDays(today, horizon);
    for (const d of occurrences(r, today, to)) {
      // 아직 띄울 때가 아니면 넘어간다 (마감 lead 일 전부터 띄운다)
      if (addDays(d, -lead) > today) continue;
      out.push({
        auto_key: autoKey(r.id, d),
        title: r.title,
        due_on: d,
        todo_category_id: r.todo_category_id || null,
        priority: r.priority || 0,
        note: r.note || null,
      });
    }
  }
  return out;
}

/** 「매달 25일 · 3일 전부터」 */
export function describe(r = {}) {
  const lead = Number(r.lead_days) || 0;
  const tail = lead > 0 ? ` · ${lead}일 전부터` : "";
  if (r.repeat_kind === "weekly") {
    const ds = (r.dows || []).join("·");
    return ds ? `매주 ${ds}${tail}` : "매주 (요일 미정)";
  }
  if (r.repeat_kind === "monthly") {
    return r.day_of_month ? `매달 ${r.day_of_month}일${tail}` : "매달 (날짜 미정)";
  }
  if (r.repeat_kind === "yearly") {
    return r.month && r.day_of_month
      ? `매년 ${r.month}월 ${r.day_of_month}일${tail}`
      : "매년 (날짜 미정)";
  }
  return "";
}
