// 업무 동선 시뮬레이션
//
// 기능이 되나 안 되나가 아니라, **하루 일이 어떤 순서로 흘러가는지**를 따라간다.
//   수업 전 → 수업 중(학생 한 명씩) → 하원 → 발송 → 다음 날
// 각 단계에서
//   · 지금 어느 화면에 있나
//   · 그 순간 필요한 정보가 그 화면에 있나
//   · 없으면 어디로 가야 하나 (화면 이동 = 흐름이 끊긴다)
// 를 기록한다.
//
// 학생은 **모두 개별진도**다. 교재도 단원도 학생마다 다르다.

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dowOf = (d) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const YM = "2026-09";

// ── 반 두 개가 이어서 온다 (실제로 하루에 여러 반) ─────────────
const CLASSES = [
  { id: "c1", name: "월수1", days: ["월", "수"], time: "16:30" },
  { id: "c2", name: "월수2", days: ["월", "수"], time: "18:30" },
];

// 학생마다 교재·진도가 전부 다르다
const S = (name, cls, book, unit, o = {}) => ({ name, cls, book, unit, ...o });
const STUDENTS = [
  S("김서은", "c1", "수능딥독3", 12),
  S("박윤찬", "c1", "리딩튜터2", 7, { missing: true }),
  S("구도은", "c1", "내신콘서트2-1", 4, { exam: "신정중" }),
  S("왕희연", "c1", "워드마스터중등", 21, { absentOn: ["2026-09-02"] }),
  S("노주하", "c1", "자이스토리", 3, { noUnits: true }),
  S("서지안", "c1", "수능딥독2", 9),
  S("홍채은", "c1", "리딩튜터3", 15, { newParentComment: true }),
  S("윤서영", "c1", "백발백중2-1", 6, { exam: "신송중" }),
  S("김소현", "c1", "구문독해100", 30),
  S("문가은", "c1", "능률보카", 18, { retest: true }),
  S("정현수", "c2", "수능딥독3", 11),
  S("장원우", "c2", "리딩튜터3", 8),
];
const MAKEUPS = [
  { name: "최유정", cls: "c1", on: "2026-09-07", absentOn: "2026-09-02", book: "수능딥독2", unit: 5 },
  { name: "오진우", cls: "c2", on: "2026-09-16", absentOn: "2026-09-09", book: "리딩튜터2", unit: 10 },
];

const dates = [];
{
  const last = new Date(2026, 9, 0).getDate();
  for (let i = 1; i <= last; i++) {
    const d = `${YM}-${String(i).padStart(2, "0")}`;
    if (CLASSES[0].days.includes(dowOf(d))) dates.push(d);
  }
}

// 흐름이 끊기는 지점을 모은다
const breaks = new Map();
function jump(from, to, why) {
  const k = `${from} → ${to} · ${why}`;
  breaks.set(k, (breaks.get(k) || 0) + 1);
}
const gaps = new Map();
function gap(where, what) {
  const k = `[${where}] ${what}`;
  gaps.set(k, (gaps.get(k) || 0) + 1);
}

let steps = 0;
const stepLog = [];
function step(screen, what, opts = {}) {
  steps++;
  if (opts.log) stepLog.push(`    ${screen.padEnd(10)} ${what}`);
}

console.log(`\n${"=".repeat(76)}`);
console.log(`  업무 동선 시뮬레이션 — ${YM} · 수업 ${dates.length}일 · 학생 ${STUDENTS.length}명 (전원 개별진도)`);
console.log(`${"=".repeat(76)}`);

dates.forEach((date, di) => {
  const first = di === 0;
  const log = di === 1;   // 둘째 날 하루를 자세히 찍는다
  if (log) console.log(`\n── ${date}(${dowOf(date)}) 하루를 따라가 봅니다 ──\n`);

  // ────────────────────────────── 1) 수업 전
  if (log) console.log("  [수업 전]");
  step("대시보드", "오늘 일정·특이사항 확인", { log });
  const comments = STUDENTS.filter((s) => s.newParentComment && di % 3 === 1);
  if (comments.length) {
    step("오늘수업", `수업 전에 볼 것 — ${comments.map((s) => s.name).join(", ")} 학부모 댓글`, { log });
  }
  step("오늘수업", "오늘 오는 학생 목록 열기", { log });

  // ────────────────────────────── 2) 수업 중 — 학생 한 명씩
  CLASSES.forEach((k) => {
    const roster = STUDENTS.filter((s) => s.cls === k.id);
    const guests = MAKEUPS.filter((m) => m.cls === k.id && m.on === date);
    if (log) console.log(`\n  [${k.name} ${k.time}] ${roster.length}명${guests.length ? ` + 보강 ${guests.length}명` : ""}`);

    [...roster, ...guests].forEach((s) => {
      const absent = (s.absentOn || []).includes?.(date);
      if (absent) {
        step("오늘수업", `${s.name} 결석 기록`, { log });
        return;
      }
      const isGuest = !!s.on;

      step("오늘수업", `${s.name} 펼치기 · 출결`, { log });

      // 교재를 보면서 지난 숙제 검사
      if (!first) {
        step("오늘수업", `  지난 숙제 확인 — ${s.book} Unit ${s.unit - 1} (배정 때 적어둔 단원이 그대로 보임)`, { log });
        step("오늘수업", `  ○ △ ✕ 로 검사`, { log });
        // 채점 결과는 말로 해준다. 입력하지 않는다.
      }

      // 보강 학생 — 결석 전에 낸 숙제가 그대로 검사 대상으로 남아 있다 (확인함)
      if (isGuest) {
        step("오늘수업", `  보강 · ${s.absentOn.slice(5)} 결석분 (줄에 표시됨)`, { log });
        step("오늘수업", `  결석 전에 낸 숙제가 그대로 검사 대상으로 뜬다`, { log });
      }

      // 테스트 점수
      step("오늘수업", "  단어 테스트 틀린 개수 입력", { log });

      // 진도
      if (s.noUnits) {
        gap("오늘수업", `${s.book} 는 단원이 없어 페이지로만 적는다`);
      } else {
        step("오늘수업", `  진도 — ${s.book} Unit ${s.unit} 완료 체크`, { log });
      }

      // 다음 숙제 — 학생마다 교재·단원이 다르므로 한 명씩 낸다
      if (s.noUnits) {
        step("오늘수업", "  다음 숙제 — 범위를 손으로 타이핑", { log });
      } else {
        step("오늘수업", `  ⟳ 지난번과 같게 → ${s.book} Unit ${s.unit + 1} 자동`, { log });
      }

      // 재시험 대상 — (고침) 오늘 수업 화면에서 바로 날짜를 잡는다
      if (s.retest) {
        step("오늘수업", "  재시험·보강 ＋날짜 잡기 → 그날 보강으로 뜬다", { log });
      }

      // 시험 기간 학생
      if (s.exam && di >= 4 && di <= 6) {
        gap("오늘수업", `${s.name}(${s.exam}) 시험 범위가 화면에 없다 — 내신 교재 어디까지 낼지 판단 불가`);
      }

      step("오늘수업", "  저장", { log });
    });
  });

  // ────────────────────────────── 3) 하원
  if (log) console.log("\n  [하원]");
  step("오늘수업", "전달사항 전달 체크", { log });

  // ────────────────────────────── 4) 발송
  if (log) console.log("\n  [발송]");
  jump("오늘수업", "발송", "리포트 보내기");
  step("발송", "데일리리포트 목록 확인 → 복사 → 문자앱", { log });
  const thin = STUDENTS.filter((s) => (s.absentOn || []).includes?.(date));
  if (thin.length) step("발송", `결석 학생 안내 (${thin.map((t) => t.name).join(", ")})`, { log });

  // 리포트 문구에 '▶ 다음 수업 숙제' 가 이미 들어간다 (확인함) → 한 통

  // ────────────────────────────── 5) 다음 수업 준비
  if (di % 2 === 1) {
    if (log) console.log("\n  [다음 수업 준비]");
    jump("발송", "수업준비", "결석 예정·공지 넣기");
    step("수업준비", "반/학생 고르고 결석예정·공지", { log });
  }
});

console.log(`\n${"=".repeat(76)}`);
console.log(`  한 달 동안 ${steps}단계 · 하루 평균 ${(steps / dates.length).toFixed(0)}단계`);
console.log(`${"=".repeat(76)}`);

console.log("\n[A] 화면을 옮겨 다닌 곳 (흐름이 끊기는 지점)\n");
[...breaks.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
  console.log(`  ${String(n).padStart(3)}회  ${k}`)
);

console.log("\n[B] 그 순간 필요한데 화면에 없는 것\n");
[...gaps.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
  console.log(`  ${String(n).padStart(3)}회  ${k}`)
);

console.log("\n[C] 둘째 날 하루 (자세히)\n");
stepLog.forEach((l) => console.log(l));
console.log("");
