// 되풀이되는 할일 — 언제 뜨는가
//
// 규칙만 적어두고, 실제 할일은 날짜가 오면 저절로 만들어진다.
// 「이번 달 수강료 안내 했나」 를 기억하고 있을 필요가 없어야 한다.

import { addDays, dowOf, endOfMonth } from "./day.js";

/**
 * 할일이 생기는 **계기**.
 *
 * 날짜로 되풀이하는 것과, 사건이 일어났을 때 생기는 것 두 갈래다.
 * 원장님께는 둘 다 「때가 되면 늘 하는 일」 이라 한 자리에 둔다.
 */
export const KINDS = [
  { key: "weekly", label: "매주", when: "date" },
  { key: "monthly", label: "매달", when: "date" },
  { key: "yearly", label: "매년", when: "date" },
  { key: "student", label: "신규 학생", when: "event",
    hint: "학생을 새로 등록하면 그 학생마다 한 번" },
  { key: "book_end", label: "교재 끝나감", when: "event",
    hint: "배정한 교재의 남은 단원이 얼마 안 남으면 한 번" },
];

/** 날짜로 되풀이하는 것인가 */
export function byDate(kind) {
  return KINDS.find((k) => k.key === kind)?.when === "date";
}

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
    if (!byDate(r.repeat_kind)) continue;        // 사건짜리는 여기서 안 만든다
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

/** 신규 학생 할일의 열쇠 — 학생 한 명당 한 번만 */
export function studentKey(routineId, studentId) {
  return `routine:${routineId}:s:${studentId}`;
}

/**
 * 교재 끝나감 할일의 열쇠.
 *
 * **회독이 들어간다.** 2회독을 돌면 시험지도 다시 뽑고 플래너도 다시 잡아야
 * 하는데, 회독을 안 넣으면 첫 회독 때 한 번 생기고 끝난다.
 */
export function bookKey(routineId, studentId, textbookId, round = 1) {
  return `routine:${routineId}:b:${studentId}:${textbookId}:${round || 1}`;
}

/**
 * 이 교재가 **끝나가나.**
 *
 * @param total 그 교재의 단원 수
 * @param done  그 학생이 이번 회독에서 끝낸 단원 수
 * @param lead  남은 단원이 몇 개 이하일 때 띄울까 (0이면 다 끝난 뒤)
 */
export function nearEnd(total, done, lead = 2) {
  const t = Number(total) || 0;
  if (t <= 0) return false;                      // 단원을 아직 안 올린 교재
  const left = Math.max(0, t - (Number(done) || 0));
  return left <= Math.max(0, Number(lead) || 0);
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
  if (r.repeat_kind === "student") return "학생을 새로 등록하면";
  if (r.repeat_kind === "book_end") {
    const area = r.book_area ? `${r.book_area} 교재가 ` : "교재가 ";
    const n = Number(r.lead_units) || 0;
    return n === 0 ? `${area}다 끝나면` : `${area}${n}단원 남으면`;
  }
  return "";
}
