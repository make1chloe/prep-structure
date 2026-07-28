// 2주를 통째로 돌려본다 — 실제 라이브러리 코드를 그대로 쓴다.
//
// 하루짜리 시뮬레이션으로는 안 보이는 것이 있다.
//   · 경고가 며칠 만에 쌓이는가 (2주에 몇 명이 걸리는가)
//   · 늦귀가 문자가 하루에 몇 통 나가는가
//   · 특강이 끝나는 주에 무슨 일이 벌어지는가
//   · 회독·루틴이 2주 뒤 어디까지 가 있는가
//   · 학생이 안 누르고 넘어간 것이 며칠째 쌓이는가
//
// 보려는 것은 "되나?" 가 아니라 **"2주 뒤에도 원장님이 버티나?"** 다.

import { judge, tally, resetDoneIn, warningLines, DEFAULT_RULE } from "../lib/warnings.js";
import { lateReasons, buildLateText } from "../lib/lateNotice.js";
import { waitingChecks, waitingFor } from "../lib/checkQueue.js";
import { score, passed, pct } from "../lib/wordTest.js";
import { summarize, buildMonthlyText } from "../lib/monthly.js";
import { trend, avgSeconds } from "../lib/trend.js";
import { isRunning, isArchived, termLabel, daysLeft, isExtra, overlaps } from "../lib/classTerm.js";
import { classSessions, studentAmount, monthRange } from "../lib/tuition.js";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dowOf = (d) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const addDays = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

const START = "2026-08-03";                       // 월요일
const DAYS = Array.from({ length: 14 }, (_, i) => addDays(START, i));

// ── 반 ────────────────────────────────────────────────
const CLASSES = [
  { id: "c1", name: "월수1", days: ["월", "수"], category: "정규반", start_time: "17:00", tuition: 320000 },
  { id: "c2", name: "화목1", days: ["화", "목"], category: "정규반", start_time: "17:00", tuition: 320000 },
  { id: "c3", name: "월수2", days: ["월", "수"], category: "정규반", start_time: "19:00", tuition: 340000 },
  // 2주 중간에 끝나는 특강 — 여기가 이번 시뮬의 핵심
  { id: "x1", name: "여름 내신특강", days: ["화", "목"], category: "특강", start_time: "19:00",
    starts_on: "2026-07-21", ends_on: "2026-08-07", tuition: 200000 },
  // 이미 끝난 특강 (지난달) — 화면에 남아 있으면 안 된다
  { id: "x0", name: "기말 대비특강", days: ["월", "수"], category: "특강", start_time: "20:30",
    starts_on: "2026-06-01", ends_on: "2026-07-10", tuition: 180000 },
];

// ── 학생 ──────────────────────────────────────────────
const NAMES = ["김O윤","박O서","이O준","최O아","정O호","강O민","조O연","윤O진","임O우","한O슬","서O빈","장O현"];
const STUDENTS = NAMES.map((name, i) => ({
  id: `s${i + 1}`,
  name,
  classes: i < 4 ? ["c1"] : i < 8 ? ["c2"] : ["c3"],
  // 12명 중 4명이 특강도 듣는다 (정규 + 특강)
  extra: [4, 5, 9, 10].includes(i) ? "x1" : null,
  // 성향 — 2주간 일관되게 유지된다
  weak: i % 5 === 0,          // 숙제를 자주 못 해온다
  slow: i % 4 === 1,          // 단어시험을 자주 못 넘긴다
  quiet: i === 7,             // 검사를 안 받고 그냥 간다
}));
STUDENTS.forEach((s) => { if (s.extra) s.classes.push(s.extra); });

const ITEMS = [
  { id: "i1", name: "단어시험", no_timer: false },
  { id: "i2", name: "숙제채점", no_timer: true },
  { id: "i3", name: "단원 설명 정독", no_timer: false },
  { id: "i4", name: "문답노트", no_timer: false },
  { id: "i5", name: "구두테스트(직접)", no_timer: true },
  { id: "i6", name: "본교재 문제풀기", no_timer: false },
  { id: "i7", name: "워크북 풀기", no_timer: false },
];

const rnd = (() => { let s = 20260803; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); })();

const RULE = { ...DEFAULT_RULE };
const problems = [];
const note = (sev, where, what) => problems.push({ sev, where, what });

// ── 2주 돌리기 ────────────────────────────────────────
const history = new Map(STUDENTS.map((s) => [s.id, []]));   // 학생별 리포트 누적
const stayOpen = new Map(STUDENTS.map((s) => [s.id, []]));  // 안 끝낸 늦귀가 과제
const sessions = new Map(STUDENTS.map((s) => [s.id, []]));  // 타이머 기록
let taps = 0, lateMsgs = 0, wordRetests = 0;
const dayRows = [];

for (const date of DAYS) {
  const dow = dowOf(date);
  const running = CLASSES.filter((c) => isRunning(c, date) && c.days.includes(dow));
  const archivedToday = CLASSES.filter((c) => isArchived(c, date));

  if (running.length === 0) { dayRows.push({ date, dow, off: true }); continue; }

  const todayIds = new Set();
  running.forEach((k) => STUDENTS.forEach((s) => s.classes.includes(k.id) && todayIds.add(s.id)));
  const today = STUDENTS.filter((s) => todayIds.has(s.id));

  let queuePeak = 0, dayLate = 0, dayTaps = 0;

  for (const s of today) {
    // 출결
    const att = rnd() < 0.06 ? "absent" : rnd() < 0.12 ? "late" : "present";
    dayTaps += 1;
    if (att === "absent") {
      history.get(s.id).push({ date, attendance_kind: "absent", items: [] });
      continue;
    }

    // 단어시험 (학생이 혼자 본다)
    const wordTotal = 30;
    const wrong = s.slow ? 2 + Math.floor(rnd() * 6) : Math.floor(rnd() * 4);
    const wordCorrect = wordTotal - wrong;
    dayTaps += 1;
    if (!passed(wordCorrect, wordTotal, RULE.wordPassPct)) wordRetests += 1;

    // 숙제 검사
    const marks = {};
    const checks = [];
    ["i6", "i7"].forEach((iid) => {
      const st = s.weak
        ? rnd() < 0.45 ? "missing" : rnd() < 0.4 ? "weak" : "done"
        : rnd() < 0.1 ? "weak" : "done";
      marks[iid] = st;
      checks.push({ name: ITEMS.find((i) => i.id === iid).name, status: st });
      dayTaps += 1;
    });

    // 검사 대기줄 — quiet 한 아이는 눌러놓고 안 온다
    const doneRows = ["i3", "i4", "i5"].map((iid) => ({
      homework_item_id: iid,
      student_done_at: `${date}T10:${String(10 + Math.floor(rnd() * 40)).padStart(2, "0")}:00Z`,
    }));
    const waiting = waitingChecks(doneRows, ITEMS, s.quiet ? {} : marks);
    queuePeak = Math.max(queuePeak, waiting.length);

    // 타이머
    ITEMS.filter((i) => !i.no_timer).forEach((i) => {
      sessions.get(s.id).push({ item: i.id, seconds: 300 + Math.floor(rnd() * 900) });
    });

    const rep = {
      date, attendance_kind: att,
      word_correct: wordCorrect, word_total: wordTotal,
      items: checks,
    };
    history.get(s.id).push(rep);

    // 늦귀가 — 자동 사유가 잡히면 문자가 나간다
    const open = Object.entries(marks)
      .filter(([, st]) => st === "missing" || st === "weak")
      .map(([iid]) => ({ body: ITEMS.find((i) => i.id === iid).name, status: "todo" }));
    stayOpen.set(s.id, open);
    const reasons = lateReasons(
      { report: { word_correct: wordCorrect, word_total: wordTotal }, checks, stay: open },
      RULE
    );
    if (reasons.length > 0) { dayLate += 1; dayTaps += 2; }   // 시간 넣고 보내기
  }

  lateMsgs += dayLate;
  taps += dayTaps;
  dayRows.push({ date, dow, classes: running.length, students: today.length,
                 queuePeak, dayLate, dayTaps, archived: archivedToday.length });
}

// ── 결과 ──────────────────────────────────────────────
const L = (s = "") => console.log(s);
L("=".repeat(70));
L(`2주 시뮬레이션  ${START} ~ ${DAYS[13]}   학생 ${STUDENTS.length}명 · 반 ${CLASSES.length}개`);
L("=".repeat(70));
L();
L("날짜         요일  반  인원  대기최대  늦귀가  탭");
for (const d of dayRows) {
  if (d.off) { L(`${d.date}  ${d.dow}   —  (수업 없음)`); continue; }
  L(`${d.date}  ${d.dow}   ${d.classes}   ${String(d.students).padStart(2)}      ${String(d.queuePeak).padStart(2)}      ${String(d.dayLate).padStart(2)}   ${String(d.dayTaps).padStart(3)}`);
}
L();
L(`합계 — 화면 누른 횟수 ${taps}회 · 늦귀가 문자 ${lateMsgs}통 · 단어 재시험 ${wordRetests}회`);
const openDays = dayRows.filter((d) => !d.off).length;
L(`      하루 평균 ${Math.round(taps / openDays)}탭 · 늦귀가 ${(lateMsgs / openDays).toFixed(1)}통`);
if (lateMsgs / openDays > 2)
  note("높음", "늦귀가 문자", `하루 평균 ${(lateMsgs / openDays).toFixed(1)}통이 나간다 (2주 ${lateMsgs}통). 12명 학원에서 이 정도면 '늦게 간다'가 일상이 되어 학부모가 문자를 안 읽게 된다`);

// 늦귀가 사유가 무엇 때문에 잡히는가 — 미흡 하나로도 문자가 나가는지
{
  const onlyWeak = lateReasons(
    { report: { word_correct: 30, word_total: 30 },
      checks: [{ name: "워크북 풀기", status: "weak" }], stay: [] }, RULE);
  if (onlyWeak.length > 0)
    note("높음", "늦귀가 문자", `숙제 하나가 '미흡(△)' 이기만 해도 늦귀가 사유로 잡힌다 — 실제로는 미흡을 남겨서 시키지 않는 날이 더 많다`);
}

// ── 경고 ──────────────────────────────────────────────
L();
L("─ 2주 뒤 경고 ─");
let warned = 0, needReflect = 0;
for (const s of STUDENTS) {
  const t = tally(history.get(s.id), [], RULE);
  if (t.count > 0) {
    warned += 1;
    if (t.need) needReflect += 1;
    const why = t.list.slice(0, 3).map((x) => `${x.date.slice(5)} ${x.reasons.join("·")}`).join("  |  ");
    L(`  ${s.name}  ${String(t.count).padStart(2)}회${t.need ? " ★반성문" : "      "}  ${why}`);
  }
}
L(`  → 경고 있는 학생 ${warned}/${STUDENTS.length}명 · 반성문 대상 ${needReflect}명 (기준 ${RULE.reflectionAt}회)`);
if (needReflect > STUDENTS.length * 0.4)
  note("높음", "경고", `2주 만에 ${needReflect}/${STUDENTS.length}명이 반성문 대상이 된다 — 한 달 기준으로는 거의 전원이 걸린다`);
if (warned === 0)
  note("낮음", "경고", "2주 동안 아무도 안 걸린다 — 기준이 너무 느슨할 수 있다");

{
  const kinds = { 지각: 0, 미제출: 0, 미흡: 0, 단어: 0 };
  STUDENTS.forEach((s) => {
    tally(history.get(s.id), [], RULE).list.forEach((x) =>
      x.reasons.forEach((r) => {
        if (r === "지각") kinds.지각 += 1;
        else if (r.startsWith("숙제 미제출")) kinds.미제출 += 1;
        else if (r.startsWith("숙제 미흡")) kinds.미흡 += 1;
        else if (r.startsWith("단어시험")) kinds.단어 += 1;
      })
    );
  });
  const total = Object.values(kinds).reduce((a, b) => a + b, 0);
  L(`  경고 사유 — 지각 ${kinds.지각} · 미제출 ${kinds.미제출} · 미흡 ${kinds.미흡} · 단어 ${kinds.단어}`);
  const soft = kinds.미흡 + kinds.지각;
  if (soft / total > 0.45)
    note("중간", "경고", `경고 사유의 ${Math.round((soft / total) * 100)}% 가 '지각' 과 '숙제 미흡' 이다 — 진짜 문제(미제출)가 묻힌다`);
}

// ── 정규 + 특강 겹치는 학생 ───────────────────────────
{
  const both = STUDENTS.filter((s) => s.extra);
  const days = DAYS.filter((d) => {
    const k = CLASSES.find((c) => c.id === "x1");
    return isRunning(k, d) && k.days.includes(dowOf(d));
  });
  L();
  L("─ 정규 + 특강 같은 날 ─");
  L(`  ${both.map((s) => s.name).join(", ")} — 2주 중 ${days.length}일 겹침`);
  L(`  오늘 수업에 같은 학생이 두 줄로 뜬다 (정규 1줄 + 특강 1줄)`);
  if (both.length > 0 && days.length > 0)
    note("중간", "오늘 수업",
      `특강 듣는 ${both.length}명은 겹치는 날 화면에 두 번 나온다. 출결은 따로 찍는 게 맞지만, ` +
      `단어시험·숙제 검사까지 두 번 보이면 어느 쪽에 적을지 헷갈린다`);
}

// ── 특강 종강 ─────────────────────────────────────────
L();
L("─ 특강 ─");
for (const k of CLASSES.filter(isExtra)) {
  const s = DAYS.map((d) => (isRunning(k, d) && k.days.includes(dowOf(d)) ? 1 : 0)).reduce((a, b) => a + b, 0);
  const lbl = termLabel(k, START);
  L(`  ${k.name}  ${k.starts_on} ~ ${k.ends_on}  2주 중 수업 ${s}회  (첫날 표시: ${lbl?.text || "—"})`);
}
// 종강 전후로 오늘 수업에서 사라지는지
const x1 = CLASSES.find((c) => c.id === "x1");
const before = DAYS.filter((d) => d <= x1.ends_on && x1.days.includes(dowOf(d)) && isRunning(x1, d)).length;
const after = DAYS.filter((d) => d > x1.ends_on && x1.days.includes(dowOf(d)) && isRunning(x1, d)).length;
L(`  종강일(${x1.ends_on}) 이후 오늘 수업에 뜬 횟수: ${after}회 (0이어야 정상)`);
if (after > 0) note("높음", "특강", "종강일이 지났는데도 오늘 수업에 뜬다");
const x0 = CLASSES.find((c) => c.id === "x0");
if (DAYS.some((d) => isRunning(x0, d))) note("높음", "특강", "지난달에 끝난 특강이 아직 살아 있다");

// ── 수강료 (특강이 달 중간에 끝나는 달) ────────────────
L();
L("─ 수강료 2026-08 ─");
const { first, last } = monthRange("2026-08");
for (const k of CLASSES.filter((c) => overlaps(c, first, last))) {
  const { all, live } = classSessions("2026-08", k, [], []);
  const amt = studentAmount(live, live.length, k.tuition, {}, all, []);
  L(`  ${k.name.padEnd(12)} 회차 ${String(live.length).padStart(2)}회  ${(amt.amount || 0).toLocaleString()}원`);
  // 기준 회차(base_sessions)를 안 넣으면 그 달 회차가 곧 기준이 되어 전액이 청구된다
  if (!k.base_sessions && isExtra(k) && live.length <= 4)
    note("높음", "수강료",
      `${k.name} 이 8월에 ${live.length}회뿐인데 ${(k.tuition).toLocaleString()}원 전액이 청구된다. ` +
      `기준 회차를 안 넣으면 '그 달 회차 = 기준 회차' 가 되어 항상 전액이 된다`);
}
const gone = CLASSES.filter((c) => !overlaps(c, first, last)).map((c) => c.name);
L(`  8월에 안 나오는 반: ${gone.join(", ") || "없음"}`);

// ── 검사 대기 ─────────────────────────────────────────
L();
L("─ 검사 대기 ─");
const quiet = STUDENTS.find((s) => s.quiet);
L(`  ${quiet.name} — 학습완료만 누르고 검사를 안 받고 감`);
const qDays = history.get(quiet.id).filter((r) => r.attendance_kind !== "absent").length;
L(`  2주간 ${qDays}일 등원. 대기줄에 매번 3건씩 올라온다 = 누적 ${qDays * 3}건`);
if (qDays * 3 > 20)
  note("중간", "검사 대기", `검사 안 받고 가는 아이 하나가 2주에 ${qDays * 3}건을 쌓는다 — 대기줄이 그 아이로 덮인다`);

// ── 타이머 · 추세 ─────────────────────────────────────
L();
L("─ 소요시간 추세 ─");
for (const s of STUDENTS.slice(0, 3)) {
  const secs = sessions.get(s.id).map((x) => x.seconds);
  const t = trend(secs.map((x) => Math.round(x / 60)));
  L(`  ${s.name}  기록 ${secs.length}건  평균 ${Math.round(avgSeconds(secs) / 60)}분  ${t.arrow} ${t.label}`);
}

// ── 월말 리포트 ───────────────────────────────────────
L();
L("─ 월말 리포트 (2주치로) ─");
const sample = STUDENTS.find((s) => s.weak);
for (const s of [STUDENTS.find((x) => x.weak), STUDENTS.find((x) => x.slow), STUDENTS[2]]) {
  const sum = summarize(history.get(s.id), []);
  L(`  ${s.name}  숙제 ${sum.homework.rate ?? "—"}%  단어 ${sum.word.rate ?? "—"}%  ` +
    `등원 ${sum.days}일 (결석 ${sum.att.absent || 0} · 지각 ${sum.att.late || 0})`);
}

// ── 문제 ──────────────────────────────────────────────
L();
L("=".repeat(70));
if (problems.length === 0) {
  L("걸린 것 없음");
} else {
  const order = { 높음: 0, 중간: 1, 낮음: 2 };
  problems.sort((a, b) => order[a.sev] - order[b.sev]);
  problems.forEach((p) => L(`[${p.sev}] ${p.where} — ${p.what}`));
}
L("=".repeat(70));
