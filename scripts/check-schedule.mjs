/** 일정 판단 검사(검사-52) — lib/schedule-plan.js 순수 셈: 칸의 일들과 차례(휴강 › 결석 › 영어일 › 시험 › 보강 › 지각 › 할 일) · 반 고르기 · 회차(8회 채우기 · 특강) · 보강 안 잡힘 · 하루의 줄 · 42칸 */
import { eventsOf, monthCells, dayRows, sessionsOf, unscheduled, classText, dayTitle, LEGEND, EVENT } from "../lib/schedule-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const b = {
  classes: [{ id: "c1", kind: "regular", nickname: null, weekdays: [1, 3], start_time: "17:00:00", sessions: 9, extra: 0 }, { id: "c2", kind: "regular", nickname: "화목 5시", weekdays: [2, 4], start_time: "17:00:00", sessions: 7, extra: 0 }, { id: "c3", kind: "special", nickname: "토 특강", weekdays: [6], start_time: "10:00:00", sessions: 4, extra: 0 }],
  holidays: [{ id: "h1", date: "2026-10-03", class_id: null, reason: "개천절", state: "on" }, { id: "h2", date: "2026-10-20", class_id: "c2", reason: "원장 연수", state: "on" }, { id: "h3", date: "2026-10-21", class_id: null, reason: "무른 것", state: "off" }],
  makeups: [{ id: "m1", student_id: "a", name: "강민서", of_date: "2026-10-14", on_date: "2026-10-18", at_time: "14:00:00", state: "set", reason: "가족 여행", class_ids: ["c1"] }, { id: "m2", student_id: "b", name: "구도은", of_date: "2026-10-14", state: "todo", reason: "학교 행사", class_ids: ["c2"] }, { id: "m3", student_id: "a", name: "강민서", of_date: null, on_date: "2026-10-29", at_time: "17:00:00", state: "set", reason: "8회 채우기", class_ids: ["c2"] }, { id: "m4", student_id: "c", name: "물린 아이", of_date: "2026-10-14", state: "cancelled", class_ids: ["c1"] }],
  lates: [{ id: "l1", student_id: "d", name: "서예린", date: "2026-10-19", minutes: 30, reason: "학교 보충", class_ids: ["c1"] }],
  exams: [{ id: "e1", scope: "school", school_id: "s", school: "신정중", name: "2학기 중간", term_from: "2026-10-14", term_to: "2026-10-17", english_on: "2026-10-16", source: "neis" }, { id: "e2", scope: "national", school: null, name: "2026년 10월 고1 모의고사", term_from: "2026-10-14", term_to: "2026-10-14", english_on: "2026-10-14", source: "neis" }],
  todos: [{ id: "t1", title: "11월 수납 안내", due_on: "2026-10-26", name: null }],
  rules: { "schedule.sessions_per_month": "8" },
};
console.log("■ 칸의 일들");
ok("14일 — 결석(강민서, 구도은 · 물린 아이 빠짐) · 영어 시험일(모의고사) · 시험 기간(신정중) — 차례: 결석 › 영어일 › 시험", eventsOf("2026-10-14", b).map((e) => e.kind).join() === "abs,exam2,exam" && eventsOf("2026-10-14", b)[0].text === "✕ 결석 · 강민서, 구도은", JSON.stringify(eventsOf("2026-10-14", b)));
ok("16일 — 영어 시험일만(그날은 시험 기간 줄을 겹쳐 안 쓴다)", eventsOf("2026-10-16", b).map((e) => e.text).join() === "📝 영어 시험일 · 신정중");
ok("3일 휴강(전체) · 20일 휴강(반 — 전체 보기엔 「(반)」 · 화목반 고르면 그대로 · 월수반 고르면 없음) · 무른 휴강은 안 뜬다", eventsOf("2026-10-03", b)[0].text === "🚫 휴강 · 개천절" && eventsOf("2026-10-20", b)[0].text === "🚫 휴강 · 원장 연수 (반)" && eventsOf("2026-10-20", b, "c2")[0].text === "🚫 휴강 · 원장 연수" && eventsOf("2026-10-20", b, "c1").length === 0 && eventsOf("2026-10-21", b).length === 0);
ok("18일 보강(강민서 14:00) · 29일 반 보강일(8회 채우기 17:00) · 19일 지각 30분 · 26일 할 일", eventsOf("2026-10-18", b)[0].text === "↻ 보강 14:00 · 강민서" && eventsOf("2026-10-29", b)[0].text === "↻ 보강 · 8회 채우기 17:00" && eventsOf("2026-10-19", b)[0].text === "⏰ 지각 30분 · 서예린" && eventsOf("2026-10-26", b)[0].text === "📋 11월 수납 안내");
ok("반을 고르면 그 반 아이들만 — 화목반 14일은 구도은만 · 월수반 19일 지각은 서예린", eventsOf("2026-10-14", b, "c2")[0].text === "✕ 결석 · 구도은" && eventsOf("2026-10-19", b, "c1").length === 1 && eventsOf("2026-10-19", b, "c2").length === 0);
console.log("■ 회차 · 알약 · 달력");
ok("회차 — 월수 9회 「8회 채움 ✓」 · 화목 7회 「⚠️ 1회 모자람 — 보강 필요」 · 특강은 「회차만큼」(ok 없음)", sessionsOf(b.classes[0], 8).text === "8회 채움 ✓" && sessionsOf(b.classes[1], 8).short === 1 && sessionsOf(b.classes[1], 8).text.includes("1회 모자람") && sessionsOf(b.classes[2], 8).ok === null);
ok("반 보강일이 회차에 더해진다(7 + 1 = 8)", sessionsOf({ ...b.classes[1], extra: 1 }, 8).ok === true);
ok("보강 안 잡힘 1(구도은) · 반 이름 「월·수 17:00」 / 별명 그대로", unscheduled(b, "2026-10") === 1 && classText(b.classes[0]) === "월·수 17:00" && classText(b.classes[1]) === "화목 5시");
const cells = monthCells("2026-10", b, { today: "2026-10-14", sel: "2026-10-14" });
ok("42칸 · 월요일부터(9/28 부터) · 그 달 밖 칸엔 일이 없다 · 오늘·고른 날", cells.length === 42 && cells[0].date === "2026-09-28" && cells[0].out && cells[0].events.length === 0 && cells.find((c) => c.date === "2026-10-14").isToday && cells.find((c) => c.date === "2026-10-14").sel);
console.log("■ 하루의 줄");
const rows = dayRows("2026-10-14", b);
ok("14일 줄 — 결석(아이마다 사유 → 보강 잡힘/안 잡힘 · 잡을 아이 목록) · 시험 둘(기간 · 영어일 · 출처 나이스) · 날 제목 「10월 14일 수」", rows[0].kind === "abs" && rows[0].small === "강민서 가족 여행 → 보강 10/18 14:00 · 구도은 학교 행사 → 보강 안 잡힘" && rows[0].items.length === 2 && rows.filter((r) => r.kind === "exam" || r.kind === "exam2").length === 2 && rows.find((r) => r.kind === "exam").tag === "나이스" && dayTitle("2026-10-14") === "10월 14일 수", JSON.stringify(rows.map((r) => [r.kind, r.title])));
ok("29일 줄 — 반 보강일 한 줄(아이 이름들 · 물릴 id 들)", dayRows("2026-10-29", b)[0].ids.join() === "m3" && dayRows("2026-10-29", b)[0].small === "강민서");
ok("범례 일곱 · 일의 갈래 일곱(차례)", LEGEND.length === 7 && EVENT.map(([k]) => k).join() === "hol,abs,exam2,exam,mk,late,todo");
console.log(`\n■ 일정 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
