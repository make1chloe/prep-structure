// 서버 시간대를 바꿔가며 같은 답이 나오는지 확인한다
import { todaySeoul, dayLabel, longLabel, shortLabel, dowOf, addDays, endOfMonth, addMonths, parts } from "../lib/day.js";
import { datesOfMonth, addDaysISO, dowOf as schedDow } from "../lib/schedule.js";
import { holidaysOf, bridgeDays } from "../lib/holidays.js";
import { sessionDates, classSessions } from "../lib/tuition.js";
import { dateLabel } from "../lib/reportText.js";

const out = {
  label: dayLabel("2026-09-24"),
  long: longLabel("2026-01-01"),
  short: shortLabel("2026-12-31"),
  dow: dowOf("2026-09-24"),
  add: addDays("2026-02-28", 1),
  eom: endOfMonth("2026-02"),
  am: addMonths("2026-11", 3),
  parts: JSON.stringify(parts("2026-03-01")),
  sched: schedDow("2026-09-24"),
  addISO: addDaysISO("2026-09-24", -1),
  month: datesOfMonth("2026-09", ["월", "수"]).join(","),
  sess: sessionDates("2026-09", ["화", "목"]).join(","),
  live: classSessions("2026-09", { id: "c", days: ["월","수","금"] }, [], ["금"]).live.length,
  hol: holidaysOf(2026).map((h) => `${h.date}${h.substitute ? "*" : ""}`).join(","),
  bridge: bridgeDays(2026).join(","),
  report: dateLabel("2026-09-24"),
};
console.log(JSON.stringify(out));

// 쓰는 법:
//   for tz in UTC Asia/Seoul America/New_York; do TZ=$tz node scripts/check-timezone.mjs; done
// 세 줄이 전부 같아야 한다. 하나라도 다르면 어딘가 서버 시간대에 기대고 있는 것이다.
