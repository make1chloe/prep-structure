// 전체 학생 × 한 달 시뮬레이션
import { classSessions, studentAmount } from "../lib/tuition.js";
import { reviewClass, monthsFrom } from "../lib/schedule.js";
import { holidayAlerts, holidaysOf } from "../lib/holidays.js";
import { buildReportText } from "../lib/reportText.js";

const YM = "2026-09";
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dowOf = (d) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const MAKEUP_DAYS = ["금"];

const CLASSES = [
  { id: "c1", name: "월수1", days: ["월", "수"], base_sessions: 8, tuition: 320000 },
  { id: "c2", name: "화목1", days: ["화", "목"], base_sessions: 8, tuition: 320000 },
  { id: "c3", name: "월수2", days: ["월", "수"], base_sessions: 8, tuition: 340000 },
  { id: "c4", name: "화목2", days: ["화", "목"], base_sessions: 8, tuition: 340000 },
];

const S = (id, name, cls, opt = {}) => ({ id, name, class_id: cls, ...opt });
const STUDENTS = [
  S("s01", "김서은", "c1"),
  S("s02", "박윤찬", "c1", { lateJoin: "2026-09-14" }),
  S("s03", "구도은", "c1", { leave: "2026-09-11" }),
  S("s04", "왕희연", "c1", { absent: ["2026-09-02"] }),
  S("s05", "노주하", "c2", { absent: ["2026-09-01", "2026-09-08"] }),
  S("s06", "서지안", "c2", { allAbsent: true }),
  S("s07", "홍채은", "c2", { noHomework: true }),
  S("s08", "윤서영", "c2", { noScores: true }),
  S("s09", "김소현", "c3", { tuition: 0 }),
  S("s10", "문가은", "c3", { tuition: null }),
  S("s11", "정현수", "c3", { exam: "신정중" }),
  S("s12", "장원우", "c3", { exam: "신송중" }),
  S("s13", "최유정", "c4", { absent: ["2026-09-24", "2026-09-25"] }),
  S("s14", "박주영", "c4", { late: true }),
  S("s15", "서한결", "c4", { onlyMakeupDay: true }),
  S("s16", "오진우", "c4", { lateJoin: "2026-09-30" }),
  S("s17", "신지섭", "c1", { leave: "2026-09-01" }),
  S("s18", "박소윤", null, { noClass: true }),
  S("s19", "양정호", "c3"),
  S("s20", "이근혁", "c4", { absent: ["2026-09-29"], noMakeup: true }),
];

const EXAMS = [
  { school: "신정중", grade: null, from_date: "2026-09-15", to_date: "2026-09-17", english_on: "2026-09-17" },
  { school: "신송중", grade: null, from_date: "2026-09-15", to_date: "2026-09-17", english_on: null },
];
const HOLIDAYS = [];

const problems = [];
const note = (sev, where, what) => problems.push({ sev, where, what });

console.log(`\n${"=".repeat(72)}\n  ${YM} 시뮬레이션 — 학생 ${STUDENTS.length}명 · 반 ${CLASSES.length}개\n${"=".repeat(72)}`);

// [1] 회차
console.log("\n[1] 반별 회차\n");
const sessionsOf = {};
CLASSES.forEach((k) => {
  const r = classSessions(YM, k, HOLIDAYS, MAKEUP_DAYS);
  sessionsOf[k.id] = r;
  console.log(
    `  ${k.name.padEnd(6)} ${(k.days || []).join("·")}  정규 ${String(r.live.length).padStart(2)}회` +
    ` (기준 ${k.base_sessions})  보강일제외 ${r.makeupOnly.length}일` +
    `  ${r.live.length !== k.base_sessions ? "← 기준과 다름" : ""}`
  );
});

// [2] 공휴일
console.log("\n[2] 공휴일 알림\n");
const classDates = new Set();
Object.values(sessionsOf).forEach((r) => r.all.forEach((d) => classDates.add(d)));
const hAlerts = holidayAlerts(`${YM}-01`, `${YM}-30`, classDates, new Set());
if (hAlerts.length === 0) console.log("  (없음)");
hAlerts.forEach((h) => console.log(`  ${h.date}(${dowOf(h.date)}) ${h.kind.padEnd(10)} ${h.name}`));

const realHolidays = holidaysOf(2026).filter((h) => h.date.startsWith(YM));
console.log("\n  9월 공휴일 전부:");
realHolidays.forEach((h) =>
  console.log(`    ${h.date}(${dowOf(h.date)}) ${h.name}  수업일? ${classDates.has(h.date) ? "예" : "아니오"}`)
);
realHolidays.forEach((h) => {
  if (classDates.has(h.date) && !hAlerts.some((a) => a.date === h.date)) {
    note("높음", "공휴일", `${h.date} ${h.name} 이 수업일인데 알림에 안 뜬다`);
  }
});

// [3] 3개월 누적
console.log("\n[3] 3개월 누적 회차\n");
const months = monthsFrom(YM, 3);
CLASSES.forEach((k) => {
  const rows = reviewClass(k, months, HOLIDAYS, EXAMS, [{ school: "신정중" }], MAKEUP_DAYS);
  const tot = rows.reduce((s, m) => s + m.live.length, 0);
  const base = rows.reduce((s, m) => s + (m.base || 0), 0);
  console.log(`  ${k.name}  ${rows.map((m) => `${Number(m.ym.slice(5))}월 ${m.live.length}회`).join(" · ")}  → 합계 ${tot}/${base}`);
  rows.forEach((m) =>
    m.alerts.filter((a) => a.advice).forEach((a) =>
      console.log(`      ${Number(m.ym.slice(5))}월 [${a.settled ? "맞음" : a.kind}] ${a.text}\n         ${a.advice}`)
    )
  );
});

// [4] 수강료
console.log("\n[4] 학생별 수강료\n");
console.log("  이름     반      회차 기준       금액  보강     차액  비고");
let sum = 0;
STUDENTS.forEach((s) => {
  if (s.noClass) {
    note("중간", "수강료", `${s.name} 은 반 배정이 없어 수강료 화면에 아예 안 나온다 (빠뜨려도 모름)`);
    console.log(`  ${s.name.padEnd(7)} (반 없음) → 화면에 안 나옴`);
    return;
  }
  const k = CLASSES.find((c) => c.id === s.class_id);
  const { all, live } = sessionsOf[k.id];
  const unit = s.tuition !== undefined ? s.tuition : k.tuition;
  const stu = { started_on: s.lateJoin || null, ended_on: s.leave || null };
  const r = studentAmount(live, k.base_sessions, unit, stu, all, s.allAbsent ? live : (s.absent || []));
  sum += r.amount || 0;
  const flag = [];
  if (r.amount === 0) flag.push("금액 0원");
  if (r.noPrice) flag.push("수강료 미입력");
  if (r.sessions === 0 && r.amount > 0) flag.push("★수업 0회인데 청구");
  console.log(
    `  ${s.name.padEnd(7)} ${k.name.padEnd(6)} ${String(r.sessions).padStart(3)} ${String(r.base).padStart(4)}` +
    ` ${String(r.amount === null ? "—" : r.amount.toLocaleString()).padStart(10)}` +
    ` ${String(r.makeupNeeded).padStart(4)} ${String(r.credit === null ? "—" : r.credit.toLocaleString()).padStart(8)}` +
    `  ${flag.join(", ")}`
  );
  if (r.sessions === 0 && r.amount > 0) {
    note("높음", "수강료", `${s.name}: 이번 달 수업이 0회인데 ${r.amount.toLocaleString()}원 청구된다`);
  }
  if (r.noPrice) note("중간", "수강료", `${s.name}: 수강료 미입력 → 합계에서 빠짐 (화면에 빨간 표시 추가함)`);
  if (unit === 0 && r.amount !== 0) note("높음", "수강료", `${s.name}: 수강료 0원인데 0원으로 안 나옴`);
});
console.log(`  ${"".padEnd(21)}합계 ${sum.toLocaleString()}원`);

// 결석만 한 학생
const abs = STUDENTS.find((s) => s.allAbsent);
{
  const k = CLASSES.find((c) => c.id === abs.class_id);
  const { all, live } = sessionsOf[k.id];
  const r = studentAmount(live, k.base_sessions, k.tuition, {}, all, live);
  console.log(`\n  ※ ${abs.name}: 한 달 내내 결석 → 금액 ${r.amount.toLocaleString()}원 (규칙대로 안 깎음), 보강필요 ${r.makeupNeeded}회`);
  if (r.makeupNeeded === 0) {
    note("높음", "수강료·보강",
      `결석만 한 학생은 보강 필요 횟수가 0으로 나온다. makeupNeeded 는 '휴강으로 빠진 회차'만 세고 결석은 안 센다`);
  }
}

// [5] 숙제 사슬
console.log("\n[5] 숙제 검사 사슬\n");
function runChain(name, days) {
  const reports = days.map((d) => ({ date: d.date, assigned: d.assigned || [], checked: d.checked || [], att: d.attendance }));
  const out = reports.map((rep, i) => {
    const prev = reports.slice(0, i).reverse();
    const idx = prev.findIndex((r) => r.assigned.length > 0);
    if (idx < 0) return { date: rep.date, toCheck: [] };
    const lastAssigned = prev[idx];
    const after = prev.slice(0, idx);
    const alreadyChecked = new Set(after.flatMap((r) => r.checked));
    return { date: rep.date, toCheck: lastAssigned.assigned.filter((x) => !alreadyChecked.has(x)) };
  });
  console.log(`  ${name}`);
  out.forEach((o, i) =>
    console.log(`    ${o.date} (${reports[i].att || "-"})  검사대상 [${o.toCheck.join(",") || "없음"}]  배정 [${reports[i].assigned.join(",") || "없음"}]`)
  );
  console.log("");
  return out;
}

const c1 = runChain("A 정상", [
  { date: "09-01", assigned: ["단어", "독해"], attendance: "present" },
  { date: "09-03", checked: ["단어", "독해"], assigned: ["문법"], attendance: "present" },
  { date: "09-08", checked: ["문법"], attendance: "present" },
]);
if (c1[1].toCheck.length !== 2 || c1[2].toCheck.length !== 1) note("높음", "숙제", "정상 흐름에서 검사 대상이 틀림");

const c2 = runChain("B 결석이 낌", [
  { date: "09-01", assigned: ["단어", "독해"], attendance: "present" },
  { date: "09-03", attendance: "absent" },
  { date: "09-08", attendance: "present" },
]);
if (c2[2].toCheck.length !== 2) note("높음", "숙제", "결석 뒤 검사 대상이 사라짐");

const c3 = runChain("C 절반만 검사", [
  { date: "09-01", assigned: ["단어", "독해", "문법"], attendance: "present" },
  { date: "09-03", checked: ["단어"], attendance: "present" },
  { date: "09-08", attendance: "present" },
]);
if (c3[2].toCheck.join(",") !== "독해,문법") {
  note("높음", "숙제", `절반만 검사한 뒤 남은 숙제가 [${c3[2].toCheck.join(",")}] 로 나온다 (독해·문법 이어야 함)`);
}

const c4 = runChain("D 다 검사한 뒤 새 숙제 안 냄", [
  { date: "09-01", assigned: ["단어"], attendance: "present" },
  { date: "09-03", checked: ["단어"], attendance: "present" },
  { date: "09-08", attendance: "present" },
  { date: "09-10", attendance: "present" },
]);
if (c4[2].toCheck.length !== 0 || c4[3].toCheck.length !== 0) {
  note("중간", "숙제", `이미 다 검사했는데 09-08/09-10 에 또 [${c4[2].toCheck.join(",")}] 이 검사 대상으로 뜬다`);
}

// [6] 리포트 문구
console.log("[6] 리포트 문구\n");
const academy = "클로이영어";
const msg = { greeting: "", closing: "" };
const R = (name, report, extra = {}) => ({ student: { name }, report, items: [], next: [], ...extra });
const cases = [
  ["평범", R("김서은", { attendance_kind: "present", word_correct: 18, word_total: 20, attitude: "Good(⭐⭐⭐⭐)" })],
  ["결석", R("서지안", { attendance_kind: "absent" })],
  ["점수 없음", R("윤서영", { attendance_kind: "present" })],
  ["숙제 전부 미제출", R("홍채은", { attendance_kind: "present" },
      { checks: [{ name: "단어", status: "missing" }, { name: "독해", status: "missing" }] })],
  ["출결 자체가 없음", R("박소윤", {})],
  ["지각 + 다음 숙제만", R("박주영", { attendance_kind: "late" },
      { next: [{ name: "단어", unit: "Unit 5", note: "p.20-25" }] })],
];
cases.forEach(([label, rep]) => {
  let text = "";
  try { text = buildReportText(rep, "2026-09-01", academy, msg) || ""; }
  catch (e) { note("높음", "리포트", `${label} 인 경우 에러: ${e.message}`); return; }
  const lines = text.split("\n").filter((l) => l.trim());
  console.log(`  ── ${label} (${lines.length}줄)`);
  lines.forEach((l) => console.log(`     ${l}`));
  console.log("");
  if (lines.length <= 2) note("중간", "리포트", `${label} 인 경우 문구가 ${lines.length}줄뿐 — 학부모가 받으면 빈 문자처럼 보인다`);
});

console.log(`${"=".repeat(72)}\n  찾은 문제 ${problems.length}건\n${"=".repeat(72)}`);
["높음", "중간", "낮음"].forEach((sev) => {
  const list = problems.filter((p) => p.sev === sev);
  if (!list.length) return;
  console.log(`\n● ${sev} (${list.length})`);
  list.forEach((p, i) => console.log(`  ${i + 1}. [${p.where}] ${p.what}`));
});
console.log("");
