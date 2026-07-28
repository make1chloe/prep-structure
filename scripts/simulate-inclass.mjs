// 등원 학습 한 타임을 통째로 돌려본다.
//
// 실제 수업은 이렇게 흐른다.
//   19:00 아이들이 몰려 들어온다 → 출결
//   19:05 각자 자기 순서대로 시작 → 타이머
//   19:20 하나둘 '다 했어요' → 검사 대기줄이 쌓인다
//   19:30 원장님이 몰아서 검사
//   20:50 하원 · 숙제 안내 · 문자
//
// 여기서 보려는 것은 "되나?" 가 아니라 **"손이 몇 번 가나?"** 다.

import { waitingChecks, waitingFor } from "../lib/checkQueue.js";
import { lateReasons } from "../lib/lateNotice.js";
import { judge, tally, DEFAULT_RULE } from "../lib/warnings.js";
import { score, passed } from "../lib/wordTest.js";
import { summarize, buildMonthlyText } from "../lib/monthly.js";

// 선생님을 기다려야 하는 것은 **구두테스트와 검사**뿐이다.
// 단어시험은 학생이 혼자 본다 (0036 에서 바로잡음).
const ITEMS = [
  { id: "i1", name: "단어시험", sort: 100, no_timer: false },
  { id: "i2", name: "숙제채점", sort: 150, no_timer: true },
  { id: "i3", name: "단원 설명 정독", sort: 200, no_timer: false },
  { id: "i4", name: "문답노트", sort: 250, no_timer: false },
  { id: "i5", name: "구두테스트(직접)", sort: 300, no_timer: true },
  { id: "i6", name: "본교재 문제풀기", sort: 400, no_timer: false },
  { id: "i7", name: "워크북 풀기", sort: 500, no_timer: false },
];
const byId = new Map(ITEMS.map((i) => [i.id, i]));

// 문법 교재 루틴 (원장님이 말씀하신 그대로)
const ROUTINE = [
  { label: "설명 정독 · 문답노트", inclass: ["i1", "i3", "i4"], home: ["i6"] },
  { label: "구두테스트 · 본교재", inclass: ["i1", "i2", "i5"], home: ["i7"] },
  { label: "마무리", inclass: ["i1", "i2"], home: [] },
];

const NAMES = ["김O윤","박O서","이O준","최O아","정O호","강O민","조O연","윤O진","임O우","한O슬"];
const rnd = (() => { let s = 20260727; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); })();
const pick = (a) => a[Math.floor(rnd() * a.length)];

let taps = 0;                 // 원장님이 화면을 누른 횟수
const tap = (n = 1) => (taps += n);
const log = [];

console.log("=".repeat(66));
console.log("등원 학습 한 타임 — 10명 · 문법 루틴");
console.log("=".repeat(66));

// ── 19:00 출결 ──────────────────────────────────────────
const students = NAMES.map((name, i) => ({
  id: `s${i}`,
  name,
  step: i % ROUTINE.length,          // 학생마다 진도가 다르다
  att: rnd() < 0.12 ? "late" : rnd() < 0.05 ? "absent" : "present",
}));

const came = students.filter((s) => s.att !== "absent");
// '전부 정시' 한 번 + 지각·결석만 따로
const odd = students.filter((s) => s.att !== "present");
tap(1 + odd.length);
console.log(`\n[19:00] 출결 — 전부 정시 1번 + 예외 ${odd.length}명 = ${1 + odd.length}번`);
console.log(`        온 학생 ${came.length}명 (지각 ${students.filter(s=>s.att==="late").length} · 결석 ${students.filter(s=>s.att==="absent").length})`);

// ── 19:02 등원 학습 배정 ─────────────────────────────────
came.forEach((s) => {
  const step = ROUTINE[s.step];
  s.inclass = step.inclass.map((id) => ({ id, doneAt: null }));
  s.home = step.home;
  tap(1); // [루틴 다음] 한 번
});
console.log(`[19:02] 등원 학습 — [⟳ 루틴 다음] ${came.length}번 (학생당 1번)`);

// ── 19:05~20:30 학생이 스스로 ────────────────────────────
// 아이가 하나씩 끝낼 때마다 완료를 누른다 (원장님 손은 안 감)
let clock = 19 * 60 + 5;
const events = [];
came.forEach((s) => {
  let t = clock + Math.floor(rnd() * 8);
  s.inclass.forEach((x) => {
    const item = byId.get(x.id);
    const mins = item.no_timer ? 5 + Math.floor(rnd() * 5) : 12 + Math.floor(rnd() * 20);
    t += mins;
    x.doneAt = t;
    x.mins = mins;
    events.push({ at: t, s, x });
  });
});
events.sort((a, b) => a.at - b.at);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ── 검사 대기줄이 어떻게 쌓이나 ──────────────────────────
console.log(`\n[19:05~] 학생이 스스로 진행 — 원장님 손 0번`);
const marks = {};
const checkedAt = new Map();
let maxQueue = 0;
let waitTotal = 0;
let waitCount = 0;

// 원장님은 20분마다 한 번씩 몰아서 검사한다고 본다
const rounds = [19 * 60 + 40, 20 * 60 + 5, 20 * 60 + 30, 20 * 60 + 50];
let cursor = 0;
rounds.forEach((now) => {
  // 지금까지 완료된 것 중 검사 필요 + 아직 안 본 것
  const queue = [];
  came.forEach((s) => {
    const rows = s.inclass
      .filter((x) => x.doneAt && x.doneAt <= now)
      .map((x) => ({
        homework_item_id: x.id,
        status: "inclass",
        student_done_at: new Date(2026, 6, 27, 0, x.doneAt).toISOString(),
      }));
    const mine = waitingChecks(rows, ITEMS, marks[s.id] || {});
    mine.filter((w) => byId.get(w.id).no_timer).forEach((w) => queue.push({ s, w }));
  });
  maxQueue = Math.max(maxQueue, queue.length);
  queue.forEach(({ s, w }) => {
    marks[s.id] = { ...(marks[s.id] || {}), [w.id]: pick(["done", "done", "done", "weak", "missing"]) };
    const doneMin = s.inclass.find((x) => x.id === w.id).doneAt;
    waitTotal += now - doneMin;
    waitCount += 1;
    tap(1); // ○△✕ 한 번
  });
  console.log(`[${hhmm(now)}] 검사 ${queue.length}건 — ${queue.length}번 누름`);
});

console.log(`\n  대기줄이 가장 길었을 때: ${maxQueue}건`);
console.log(`  아이가 기다린 평균 시간: ${Math.round(waitTotal / Math.max(1, waitCount))}분`);

// ── 20:50 하원 ───────────────────────────────────────────
console.log(`\n[20:50] 하원 · 마무리`);
let lateCount = 0;
came.forEach((s) => {
  const wordTotal = 20;
  const wordCorrect = 20 - Math.floor(rnd() * 5);
  tap(1); // 단어 점수
  s.report = { attendance_kind: s.att, word_correct: wordCorrect, word_total: wordTotal };
  const checks = Object.entries(marks[s.id] || {})
    .filter(([, v]) => v === "weak" || v === "missing")
    .map(([id, v]) => ({ name: byId.get(id).name, status: v }));
  const reasons = lateReasons({ report: s.report, checks, stay: [] }, DEFAULT_RULE);
  if (reasons.length > 0) {
    lateCount += 1;
    tap(2); // 하원 시간 + 보내기
  }
  s.checks = checks;
  tap(1); // 저장
});
console.log(`        하원 안내 대상 ${lateCount}명 (자동으로 잡힘 · 시간만 입력)`);

// ── 손이 몇 번 갔나 ──────────────────────────────────────
console.log("\n" + "=".repeat(66));
console.log(`원장님이 누른 횟수: 총 ${taps}번 · 학생 1명당 ${(taps / came.length).toFixed(1)}번`);
console.log("=".repeat(66));

// ── 걸리는 것 ────────────────────────────────────────────
const problems = [];

// 1) 검사 대기줄이 한꺼번에 몰리나
if (maxQueue >= came.length * 0.6) {
  problems.push(
    `검사 대기가 한 번에 ${maxQueue}건까지 몰립니다. 아이들이 비슷한 속도로 끝내기 때문입니다.\n` +
    `   → 대기줄을 '오래 기다린 순' 으로 보여줘야 합니다 (이미 그렇게 되어 있음).\n` +
    `   → 다만 ${maxQueue}건을 연속으로 찍으려면 학생 칸을 ${maxQueue}번 열어야 합니다.`
  );
}

// 2) 아이가 기다리는 시간
const avgWait = Math.round(waitTotal / Math.max(1, waitCount));
if (avgWait > 15) {
  problems.push(
    `아이가 검사를 기다리는 시간이 평균 ${avgWait}분입니다.\n` +
    `   → 기다리는 동안 다음 걸 하게 되어 있지만, 단어시험처럼 '먼저 봐야 하는 것' 이 막히면\n` +
    `      뒤 순서가 통째로 밀립니다.`
  );
}

// 3) 선생님을 기다려야 하는 것이 순서 앞쪽에 몰려 있나
const front = ITEMS.slice(0, 3).filter((i) => i.no_timer);
if (front.length >= 2) {
  problems.push(
    `순서 앞쪽 셋 중 ${front.length}개가 '선생님과 함께' 입니다 (${front.map((i) => i.name).join(", ")}).\n` +
    `   → 등원 직후에 기다림이 몰립니다. 혼자 할 수 있는 것을 앞에 두면 흩어집니다.`
  );
}

// 4) 학생 화면에서 고를 것
const maxItems = Math.max(...came.map((s) => s.inclass.length));
if (maxItems > 5) {
  problems.push(`한 타임에 등원 학습이 ${maxItems}개까지 됩니다. 아이 화면에 다 안 들어옵니다.`);
}

console.log("\n걸리는 것");
if (problems.length === 0) console.log("  없음");
problems.forEach((p, i) => console.log(`\n${i + 1}. ${p}`));

// ── 월말 리포트가 제대로 나오나 ───────────────────────────
const one = came[0];
const month = Array.from({ length: 8 }, (_, k) => ({
  date: `2026-07-${String(2 + k * 3).padStart(2, "0")}`,
  attendance_kind: k === 3 ? "late" : "present",
  word_correct: 20 - Math.floor(rnd() * 4),
  word_total: 20,
  items: [{ status: "done" }, { status: rnd() < 0.2 ? "missing" : "done" }],
}));
console.log("\n" + "=".repeat(66));
console.log("월말 리포트 미리보기");
console.log("=".repeat(66));
console.log(
  buildMonthlyText(
    { student: { name: one.name }, ym: "2026-07", sum: summarize(month, [{ name: "Chapter 3 관계대명사", score: 17, total: 20 }]) },
    "클로이영어",
    {}
  )
);
