import { sessionNumbers } from "./schedule.js";
import { dayLabel } from "./day.js";

/**
 * **한 달 예상 수업일정을 말로 적는다** (원장님 2026-08-23 — 「먼저 일정을
 * 보내고 봐라, 결석 이 중에 있냐 물어보는 거지」).
 *
 * **회차를 여기서 다시 세지 않는다.** 앱 달력(lib/studentCalendar.js)과
 * 수강료(lib/tuition.js)가 이미 `sessionNumbers` 한 벌을 쓴다. 본문에서
 * 따로 세면 어머니가 앱 달력을 열었을 때 숫자가 달라진다 (원칙 1).
 *
 * 결석은 회차를 **줄이지 않는다** — 학원 규칙이 「결석은 차감하지 않고
 * 보강으로 처리」이기 때문이다(lib/tuition.js). 그래서 결석 예정일은
 * 회차 목록에 그대로 두고 「빠질 예정」으로만 덧붙인다.
 */

/** 「9/1(월) 1회차」 한 줄 */
function line(date, n) {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}(${dayLabel(date)}) ${n}회차`;
}

/**
 * @param klasses  이 학생이 듣는 반들 [{ id, name, days, ... }]
 * @param ym       'YYYY-MM'
 * @param offOf    (classId) => Set(휴강 날짜)  — 전체휴강 + 그 반 휴강
 * @param makeupDays 보강 전용 요일 (회차에서 뺀다)
 * @param absences  이 학생의 그 달 결석 예정 [{ date, reason }]
 * @returns { count, lines, dates, offs, absents, byClass }
 */
export function monthPlan(klasses = [], ym, offOf = () => new Set(), makeupDays = [], absences = []) {
  const byClass = [];
  let all = [];

  for (const k of klasses) {
    const off = offOf(k.id) || new Set();
    const nums = sessionNumbers(k, ym, off, makeupDays);
    const dates = [...nums.keys()].sort();
    byClass.push({
      classId: k.id,
      name: k.name || "",
      count: dates.length,
      lines: dates.map((d) => line(d, nums.get(d))),
      offs: [...off].filter((d) => (d || "").startsWith(ym)).sort(),
    });
    all = all.concat(dates.map((d) => ({ date: d, n: nums.get(d), klass: k.name || "" })));
  }

  all.sort((a, b) => a.date.localeCompare(b.date));

  // 반이 여럿인 아이는 어느 반 것인지 알아야 한다 (앱 달력과 같은 처리)
  const many = byClass.length > 1;
  const lines = all.map((x) => (many ? `${x.klass} ${line(x.date, x.n)}` : line(x.date, x.n)));

  const absents = (absences || [])
    .filter((a) => (a.date || "").startsWith(ym))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => {
      const [, m, d] = a.date.split("-");
      return `${Number(m)}/${Number(d)}(${dayLabel(a.date)})${a.reason ? ` ${a.reason}` : ""}`;
    });

  const offs = [...new Set(byClass.flatMap((c) => c.offs))].sort();

  return { count: all.length, lines, dates: all, offs, absents, byClass };
}

/**
 * **아직 시험 기간이 안 나온 학교인가.**
 *
 * 판정은 회차 화면과 같은 자리다 — 영어 시험일(english_on)이 비어 있으면
 * 「미정」 (app/schedule/ScheduleBoard.jsx 의 앰버 태그와 같은 조건).
 * 걸리는 시험이 하나도 없으면 그것도 미정으로 본다 — 학교가 아직 안 올린 것이다.
 */
export function examUndecided(myExams = []) {
  if (myExams.length === 0) return true;
  return myExams.some((e) => !e.english_on);
}
