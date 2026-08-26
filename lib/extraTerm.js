// 특강(student_extra_schedules — 0164) 을 기존 반 셈에 태우는 어댑터.
// 새 셈을 만들지 않는다 — 반 모양으로 바꿔서 inTermOn·meetsOn·sessionNumbers 를
// 그대로 재사용한다 (원칙 1: 같은 판단 두 벌 금지).

/** 특강 스케줄 줄을 반 모양으로 — inTermOn(schedule.js)·meetsOn(classTerm.js) 재사용 */
export function toTermShape(sched = {}) {
  return { id: `extra:${sched.label}`, name: sched.label, days: sched.days || [],
           start_time: sched.start_time, end_time: sched.end_time,
           starts_on: sched.from_date, ends_on: sched.to_date, archived_at: null };
}

/** 이 특강에 걸리는 쉬는 날 Set — 학원 전체 휴강 ∪ 이 특강만 쉬는 날.
 *  특강엔 class_id 가 없어서 lib/tuition.js 의 휴강 Set 셈(class_id 비교)에
 *  안 걸린다 — 그래서 따로 만든다. */
export function offSetFor(sched = {}, holidays = []) {
  return new Set([
    ...holidays.filter((h) => h.scope === "all").map((h) => h.date),
    ...(sched.off_dates || []),
  ]);
}
