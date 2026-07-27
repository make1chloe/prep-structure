// 수업 시간 동선 시뮬레이션
//
// 실제로 하는 일을 그대로 따라간다.
//   교재를 펼쳐놓고 → 숙제 검사 → 채점 결과 피드백 → 다음 할일 안내
// 반 10명 + 보강 학생이 섞인 상태로 한 달을 돌리면서
//   · 화면에 없어서 못 하는 것 (데이터 구멍)
//   · 탭(클릭) 수 — 수업 중에 감당 가능한가
// 두 가지를 잰다.
//
// 탭 수는 app/today/StudentPanel.jsx 의 실제 동작을 그대로 옮겨 세었다.
//   숙제 검사 칩: 클릭할 때마다 완료 → 미흡 → 미제출 → 없음 (그래서 미제출은 3탭)
//   점수: 단어 맞은/전체 + 문장 맞은/전체 = 최대 4칸
//   다음 숙제: 칩 1탭 + 교재 고르기 1탭 + 단원 고르기 1탭 (+ 범위 메모)

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dowOf = (d) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];

const YM = "2026-09";
const CLASS = { name: "월수1", days: ["월", "수"] };

// ── 학생 10명 + 보강으로 끼는 2명 ───────────────────────────
const R = (name, o = {}) => ({ name, ...o });
const ROSTER = [
  R("김서은", { first: true }),   // 이 학생 것을 만들어 반 전체에 복사한다
  R("박윤찬", { hard: true }),                 // 숙제를 자주 미제출
  R("구도은"),
  R("왕희연", { absent: ["2026-09-02"] }),
  R("노주하", { noBook: true }),               // 교재 배정 안 됨
  R("서지안", { noUnits: true }),              // 교재는 있는데 단원 데이터 없음
  R("홍채은"),
  R("윤서영", { manyItems: true }),            // 숙제 항목이 많음 (5개)
  R("김소현"),
  R("문가은", { retest: true }),               // 단어 재시험 대상
];
const MAKEUP_GUESTS = [
  R("장원우", { makeupOf: "2026-08-31" }),
  R("최유정", { makeupOf: "2026-09-01" }),
];

const problems = [];
const P = (sev, where, what) => problems.push({ sev, where, what });

// 그 달 수업일
const dates = [];
{
  const last = new Date(2026, 9, 0).getDate();
  for (let i = 1; i <= last; i++) {
    const d = `${YM}-${String(i).padStart(2, "0")}`;
    if (CLASS.days.includes(dowOf(d))) dates.push(d);
  }
}

console.log(`\n${"=".repeat(74)}`);
console.log(`  수업 동선 시뮬레이션 — ${CLASS.name} ${ROSTER.length}명 + 보강 ${MAKEUP_GUESTS.length}명`);
console.log(`  ${YM} · 수업 ${dates.length}회 (${CLASS.days.join("·")})`);
console.log(`${"=".repeat(74)}\n`);

// ── 한 학생 한 번 처리할 때 드는 탭 수 ──────────────────────
function tapsFor(st, day) {
  const t = { 펼치기: 1, 출결: 1, 검사: 0, 점수: 0, 진도: 0, 태도: 1, 다음숙제: 0, 저장: 1 };
  const missing = [];

  if (day.absent) return { taps: { 펼치기: 1, 출결: 1, 저장: 1 }, missing: [], absent: true };

  // 숙제 검사 — ○ △ ✕ 를 바로 누른다 (고치기 전에는 칩을 돌려서 미제출이 3탭)
  day.check.forEach((c) => {
    t.검사 += 1;
    // 채점 결과는 미흡·미제출이면 칸이 자동으로 열린다 (타이핑 3탭으로 셈)
    if (c.feedback) t.피드백 = (t.피드백 || 0) + 3;
  });

  // 점수 — 전체 개수는 지난번 값이 미리 채워져 있고, 틀린 개수만 친다
  if (day.word) t.점수 += day.firstTime ? 2 : 1;
  if (day.sent) t.점수 += day.firstTime ? 2 : 1;

  // 진도
  if (st.noBook) missing.push("교재가 배정 안 돼 진도를 못 찍는다");
  else if (st.noUnits) missing.push("교재에 단원이 없어 페이지로만 적어야 한다");
  else t.진도 += day.units || 1;

  // 다음 숙제
  //   반 첫 학생만 만들고 '반 전체에 같은 숙제' 로 복사한다 → 나머지는 0탭
  if (day.next.length > 0) {
    if (day.copiedFromClass) {
      // 아무것도 안 눌러도 이미 배정돼 있다
    } else if (day.sameAsLast && !st.noBook && !st.noUnits) {
      t.다음숙제 += 1;                     // ⟳ 지난번과 같게
      t.다음숙제 += day.next.filter((n) => n.changed).length * 2;  // 바꾸는 것만 손댄다
      if (st.first) t.다음숙제 += 1;        // 반 전체에 복사 1탭
    } else {
      day.next.forEach((n) => {
        t.다음숙제 += 1;
        if (st.noBook) { missing.push(`${n.name}: 고를 교재가 없다`); return; }
        t.다음숙제 += 1;
        if (st.noUnits) { t.다음숙제 += 3; missing.push(`${n.name}: 단원이 없어 범위를 손으로 친다`); }
        else t.다음숙제 += 1;
        if (n.note) t.다음숙제 += 3;
      });
    }
  }

  if (day.notice) t.notice = 3;
  return { taps: t, missing };
}

// ── 하루치 만들기 ──────────────────────────────────────────
function makeDay(st, i) {
  const absent = (st.absent || []).includes(dates[i]);
  const n = st.manyItems ? 5 : 3;
  const names = ["단어", "독해", "문법", "워크북", "영작"].slice(0, n);
  const check =
    i === 0
      ? []
      : names.map((name, k) => ({
          name,
          status: st.hard && k === 0 ? "missing" : k === 1 && i % 3 === 0 ? "weak" : "done",
          // 미흡·미제출이면 왜 그런지 한 줄 적고 싶어진다
          feedback:
            st.hard && k === 0 ? "단어 20개 중 12개만 외워옴"
            : k === 1 && i % 3 === 0 ? "3번 문제 대명사 지칭 틀림"
            : null,
        }));
  return {
    absent,
    check,
    firstTime: i === 0,
    word: !absent,
    sent: !absent && !st.hard,
    units: st.manyItems ? 2 : 1,
    // 대부분은 지난번과 같은 교재의 다음 단원. 가끔(4회에 1번) 바꾼다
    sameAsLast: i > 0,
    // 반 첫 학생이 만들고 나머지는 복사받는다 (개별로 다른 학생만 직접 낸다)
    copiedFromClass: !st.first && !st.noBook && !st.noUnits && !st.manyItems && !absent,
    next: absent ? [] : names.map((name) => ({ name, note: name === "독해", changed: i % 4 === 0 && name === "독해" })),
    notice: i % 4 === 0,
  };
}

// ── 한 달 돌리기 ───────────────────────────────────────────
const totals = {};
const missingAll = new Map();
let studentTurns = 0;

dates.forEach((date, i) => {
  const today = [...ROSTER];
  // 보강 학생이 그날 섞인다 (한 달에 몇 번)
  if (i === 2) today.push(MAKEUP_GUESTS[0]);
  if (i === 5) today.push(MAKEUP_GUESTS[1]);

  today.forEach((st) => {
    const day = makeDay(st, i);
    const { taps, missing } = tapsFor(st, day);
    studentTurns++;
    Object.entries(taps).forEach(([k, v]) => (totals[k] = (totals[k] || 0) + v));
    missing.forEach((m) => missingAll.set(m, (missingAll.get(m) || 0) + 1));
  });
});

const sum = Object.values(totals).reduce((a, b) => a + b, 0);
console.log("[1] 한 달 동안 누른 횟수\n");
Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${k.padEnd(8)} ${String(v).padStart(5)}탭`));
console.log(`  ${"합계".padEnd(8)} ${String(sum).padStart(5)}탭   (학생-회 ${studentTurns}건)`);

const perStudent = sum / studentTurns;
const perClass = perStudent * (ROSTER.length + 0.2);
console.log(`\n  학생 한 명당 ${perStudent.toFixed(1)}탭 · 한 수업(약 10명) ${perClass.toFixed(0)}탭`);
if (perStudent > 15) {
  P("높음", "동선",
    `학생 한 명 기록에 ${perStudent.toFixed(1)}탭이 든다. 10명이면 한 수업에 ${perClass.toFixed(0)}탭 — ` +
    `수업하면서 하기엔 많다`);
}

console.log("\n[2] 탭이 어디서 많이 드나\n");
const rank = Object.entries(totals).sort((a, b) => b[1] - a[1]);
rank.forEach(([k, v]) => {
  const pct = ((v / sum) * 100).toFixed(0);
  console.log(`  ${k.padEnd(8)} ${"█".repeat(Math.round(pct / 2))} ${pct}%`);
});

console.log("\n[3] 화면에 없어서 못 하는 것\n");
if (missingAll.size === 0) console.log("  (없음)");
[...missingAll.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([m, n]) => console.log(`  ${String(n).padStart(4)}회  ${m}`));

// 채점 피드백을 적을 곳이 아예 없다
const fbCount = [...missingAll.entries()]
  .filter(([m]) => m.includes("적을 칸이 없다"))
  .reduce((a, [, n]) => a + n, 0);
if (fbCount > 0) {
  P("높음", "채점 피드백",
    `숙제마다 왜 미흡·미제출인지 적을 칸이 없다. 한 달에 ${fbCount}번 필요했다. ` +
    `지금은 리포트 전체 '공지' 한 칸에 몰아 써야 한다`);
}

// 검사 칩 3탭 문제
const missTaps = ROSTER.filter((s) => s.hard).length * dates.length * 3;
if (totals.검사 / studentTurns > 3) {
  P("중간", "숙제 검사",
    `검사 칩이 '완료→미흡→미제출→없음' 순환이라 미제출은 3번 눌러야 한다. ` +
    `한 달 검사 ${totals.검사}탭 중 상당수가 이 때문`);
}

// 다음 숙제 반복 입력
if (totals.다음숙제 / studentTurns > 5) {
  P("높음", "다음 숙제",
    `다음 숙제 배정이 학생당 평균 ${(totals.다음숙제 / studentTurns).toFixed(1)}탭. ` +
    `매번 교재·단원을 처음부터 다시 고른다. 대부분 '지난번과 같은 교재의 다음 단원' 인데도`);
}

console.log("\n[4] 보강 학생이 섞였을 때\n");
console.log("  · 오늘 수업 화면에서 반 목록 아래 '보강' 그룹으로 따로 뜬다");
console.log("  · 보강 줄에 '보강 · 9/2 결석분' 처럼 원 결석일이 붙는다 (고침)");
// (고침) 보강 줄에 '9/2 결석분' 처럼 원 결석일이 붙는다

console.log("\n[5] 수업 중에 대시보드를 같이 볼 수 있나\n");
console.log("  · 오늘 수업 맨 위 '수업 전에 볼 것' 에 오늘 오는 학생의 댓글·결석요청만 모인다 (고침)");
// (고침) 오늘 수업 맨 위 '수업 전에 볼 것' 에 오늘 오는 학생의 댓글·요청만 모아 띄운다

console.log(`\n${"=".repeat(74)}\n  찾은 것 ${problems.length}건\n${"=".repeat(74)}`);
["높음", "중간", "낮음"].forEach((sev) => {
  const list = problems.filter((p) => p.sev === sev);
  if (!list.length) return;
  console.log(`\n● ${sev} (${list.length})`);
  list.forEach((p, i) => console.log(`  ${i + 1}. [${p.where}] ${p.what}`));
});
console.log("");
