// 속도 대원칙(원칙 6)이 무너지지 않았나
//
// 원장님 (2026-08-14): 「버튼입력속도, 모든 페이지의 로딩 자체가 느려」 →
// 구조를 걷어냈다 (파도 · 쿠키 세션 · 낙관적 칩 · 배지 메모). 그리고:
// 「앞으로 구조 변경을 할 때에도 이걸 훼손하지 않도록 명시해」.
//
// 훼손은 조용히 온다 — 기능을 하나 더할 때 파도 밖에 `await supabase` 를
// 한 줄 놓는 것이 제일 쉽고, 그 한 줄이 층 하나다. 열 번이면 도로 직렬이다.
// 오류는 안 나고 화면만 조금씩 느려져서 아무도 못 잡는다. 그래서 기계가 센다.

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";

let bad = 0;
const say = (m) => { console.log(`  ❌ ${m}`); bad++; };
const ok = (m) => console.log(`  ✅ ${m}`);

// ── 1) 파도가 풀리지 않았나 — 직렬 조회 개수 상한 ───────────────
//
// 상한 = 지금 개수 + 여유 2. 폴백 사다리(실패 시에만 도는 길)까지 포함해
// 세므로 0 이 아니다. **기능을 더해 상한에 걸리면 조회를 파도에 태우는
// 것이 답이지, 상한을 올리는 것이 답이 아니다** (올릴 때는 그만한 까닭을
// 이 줄 옆에 적을 것).
console.log("== 파도가 풀리지 않았나 (직렬 조회 상한) ==");
const CAPS = [
  ["app/today/page.jsx", 24, true],
  ["app/students/page.jsx", 8, true],
  ["app/textbooks/page.jsx", 10, true],
  // tasks 는 내신·보강 헬퍼 함수(파도 안에서 도는)의 내부 조회까지 세어져 12다
  ["app/tasks/page.jsx", 14, true],
  ["app/plan/page.jsx", 4, true],
  // 학생·학부모 화면 — 아이들 폰에서 매일 열린다. 41·32 직렬이던 것을 파도로
  ["app/me/page.jsx", 19, true],
  ["app/parent/page.jsx", 19, true],
  ["app/schools/page.jsx", 5, true],
  ["app/videos/page.jsx", 2, true],
  ["app/report/page.jsx", 3, true],
  ["app/scores/page.jsx", 4, true],
];
for (const [f, cap, needWave] of CAPS) {
  const s = readFileSync(f, "utf8");
  const n = (s.match(/await supabase/g) || []).length;
  if (n > cap) say(`${f} — await supabase 가 ${n}개 (상한 ${cap}). 파도에 태우세요 (원칙 6-1)`);
  if (needWave && !/Promise\.all\(/.test(s)) say(`${f} — 파도(Promise.all)가 사라졌습니다`);
}
if (!bad) ok(`${CAPS.length}개 화면 — 파도 유지`);

// ── 2) 인증 서버 왕복이 새로 들어오지 않았나 ────────────────────
console.log("\n== 로그인 확인이 쿠키로 남아 있나 ==");
const files = [];
for (const root of ["app", "lib"]) {
  (function walk(d) {
    for (const f of readdirSync(d)) {
      const p = `${d}/${f}`;
      if (statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(f)) walk(p); }
      else if (/\.jsx?$/.test(f)) files.push(p);
    }
  })(root);
}
let authHits = 0;
for (const f of files) {
  if (f === "lib/session.js") continue;            // 설명 주석에 이름이 나온다
  const s = readFileSync(f, "utf8");
  if (/auth\.getUser\(/.test(s)) {
    say(`${f} — auth.getUser() 는 부를 때마다 인증 서버 왕복입니다. lib/session 의 sessionUser 를 쓰세요 (원칙 6-2)`);
    authHits++;
  }
}
if (!authHits) ok("auth.getUser 없음 — 전부 쿠키 세션");
// 미들웨어도
const mw = readFileSync("lib/supabase/middleware.js", "utf8");
if (!/getSession\(/.test(mw)) say("미들웨어가 getSession 을 안 씁니다 — 요청마다 인증 왕복이 되살아납니다");
if (!/app-role/.test(mw)) say("미들웨어의 역할 쿠키 캐시(app-role)가 사라졌습니다");

// ── 3) 낙관적 반응이 남아 있나 ─────────────────────────────────
console.log("\n== 자주 누르는 칩이 낙관적으로 남아 있나 ==");
const OPTIMISTIC = [
  ["app/today/TodayBoard.jsx", /paint\(/, "출결 찍기"],
  ["app/check/CheckBoard.jsx", /setOptMark\(/, "숙제 검사 ○△✕"],
  ["components/BookProgress.jsx", /setUnits\(\(list\)/, "진도 칩"],
];
for (const [f, re, what] of OPTIMISTIC) {
  if (!existsSync(f)) { say(`${f} 가 없습니다 — 이 표를 고쳐주세요`); continue; }
  if (!re.test(readFileSync(f, "utf8"))) {
    say(`${f} — ${what}가 화면을 먼저 바꾸지 않습니다 (원칙 6-3: 누르면 0.1초)`);
  }
}
if (!bad) ok("출결 · 숙제 검사 · 진도 — 누르는 순간 바뀐다");

// ── 4) 배지 메모 ──────────────────────────────────────────────
console.log("\n== 배지 세기가 화면마다 다시 돌지 않나 ==");
const mb = readFileSync("lib/menuBadges.js", "utf8");
if (!/_memo/.test(mb)) say("lib/menuBadges 의 메모가 사라졌습니다 — 화면마다 열일곱 조회가 다시 돕니다 (원칙 6-4)");
else if (!/NODE_ENV === "production"/.test(mb)) say("배지 메모가 검사(가짜 DB)까지 기억합니다 — 배포에서만 켜야 합니다");
else ok("배지 메모 유지 (배포에서만)");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요 (docs/PRINCIPLES.md 원칙 6)"); process.exit(1); }
console.log("\n✅ 속도 검사 통과");
