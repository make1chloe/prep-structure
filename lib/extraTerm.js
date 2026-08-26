// 특강(student_extra_schedules — 0164) 을 기존 반 셈에 태우는 어댑터.
// 새 셈을 만들지 않는다 — 반 모양으로 바꿔서 inTermOn·meetsOn·sessionNumbers 를
// 그대로 재사용한다 (원칙 1: 같은 판단 두 벌 금지).

import { sessionDates } from "./tuition.js";

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

/**
 * 특강 여러 줄 → **학생별 「그 달 실제 특강일」** Map.
 *
 * 월간(총 N회 수업)·학생/학부모 이번 달 셈이 같은 날짜를 봐야 해서 한 곳에
 * 둔다 — 세 화면이 저마다 세면 언젠가 한쪽만 고치게 된다 (원칙 1).
 * 정규 수업과 겹친 날을 빼는 일은 여기서 안 한다 — 그 판단은
 * summarize(lib/monthly) 가 리포트 날짜를 들고 한 번만 한다.
 *
 * @param absences student_extra_absences 줄들 — status 'absent' 만 뺀다.
 *                 'makeup' 은 예외적으로 채워 준 날이라 수업일로 남긴다 (0164).
 * @param from/to  더 좁힐 범위 (이번 달은 오늘까지만 — 리포트와 같은 기준)
 */
export function extraDatesBy(scheds = [], ym, holidays = [], absences = [], { from, to } = {}) {
  const absent = new Set(
    absences.filter((a) => a.status === "absent").map((a) => `${a.schedule_id}|${a.date}`)
  );
  const map = new Map();
  scheds.forEach((x) => {
    const off = offSetFor(x, holidays);
    const mine = sessionDates(ym, x.days || [])
      .filter((d) => d >= x.from_date && d <= x.to_date)
      .filter((d) => (!from || d >= from) && (!to || d <= to))
      .filter((d) => !off.has(d) && !absent.has(`${x.id}|${d}`));
    if (mine.length === 0) return;
    map.set(x.student_id, [...(map.get(x.student_id) || []), ...mine]);
  });
  return map;
}
