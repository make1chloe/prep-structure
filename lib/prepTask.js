// 숙제를 배정하면 따라오는 **내 할일**
//
// 단원평가 대비 복습을 내주면 다음 수업 전에 내가 문제를 내야 한다.
// 그걸 기억하고 있을 필요가 없게, 배정하는 순간 할일이 생긴다.
//
// 어떤 숙제가 그런지는 코드가 아니라 **숙제 항목에** 적혀 있다
// (`homework_items.prep_task`). 학습 항목 화면에서 언제든 바꿀 수 있다.

import { addDays, dowOf } from "./day.js";

/** "{학생} 단원평가 출제" → "김O윤 단원평가 출제" */
export function taskTitle(template, studentName) {
  const t = (template || "").trim();
  if (!t) return "";
  return t.replace(/\{학생\}/g, studentName || "학생").trim();
}

/**
 * 다음 수업일. 숙제는 다음 수업에 검사하므로 그때까지 준비돼 있어야 한다.
 * @param days ["월","수"] — 그 학생이 다니는 반들의 요일을 합친 것
 */
export function nextClassDate(date, days = [], max = 21) {
  const set = new Set(days.filter(Boolean));
  if (set.size === 0) return addDays(date, 7);
  for (let i = 1; i <= max; i += 1) {
    const d = addDays(date, i);
    if (set.has(dowOf(d))) return d;
  }
  return addDays(date, 7);
}

/** 같은 배정으로 할일이 두 번 생기지 않게 하는 열쇠 */
export function autoKey(studentId, itemId, date) {
  return `prep:${studentId}:${itemId}:${date}`;
}
