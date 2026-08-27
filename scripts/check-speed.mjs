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
  // `await createClient()` 는 일부러 안 센다 (2026-08-26, 16 직행 2단계).
  // 쿠키 읽기라 DB 왕복이 아니고 파일당 한 번뿐이다. 단, 이 줄 덕에
  // 카운터가 통과한다고 파도가 안전한 건 아니니 — DB 조회를 더할 때는
  // 여전히 `await supabase` 로 세어진다는 사실이 이 검사의 전부다.
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

// ── 4-2) 위 메뉴는 뿌리에 한 번, 세는 일은 서버에 ────────────────
//
// 서른 화면이 저마다 위 메뉴를 그리고 있었다 — 반·학생 배정은 조회 28 중
// 22(79%)가 메뉴 몫이었다. 뿌리 레이아웃으로 올려서, 화면을 옮길 때 그
// 스물두 자리가 통째로 안 돌게 했다 (실측: 소프트 이동 시 layout 재렌더 0회).
//
// 무너지는 길이 둘이다. 둘 다 오류가 안 난다.
//   1) 새 화면에 `<TopBar>` 를 한 줄 붙인다 → 메뉴가 두 줄로 뜨고 그 화면만
//      다시 스물두 조회 (그건 scripts/check-home.mjs 가 센다)
//   2) NavGrid(브라우저 몫)에서 세는 함수를 부른다 → lib/menuBadges 계산
//      뭉치가 통째로 브라우저로 내려간다. 속도를 고치러 와서 늘리는 꼴이다
console.log("\n== 위 메뉴에서 세는 일이 브라우저로 안 내려갔나 ==");
{
  const nav = readFileSync("components/NavGrid.jsx", "utf8");
  // 설명 주석에도 이름이 나온다 — **가져오는 줄만** 본다
  const brings = (nav.match(/^import .*$/gm) || []).join("\n");
  for (const lib of ["menuBadges", "lib/inbox", "sqlBadge", "supabase"]) {
    if (brings.includes(lib)) say(`components/NavGrid 가 ${lib} 를 가져옵니다 — 세는 일은 TopBar(서버)에 두세요`);
  }
  if (!/^"use client"/.test(nav)) say("components/NavGrid 가 브라우저 조각이 아닙니다 — 그러면 「지금 여기」 가 첫 화면에서 굳습니다");
  if (!bad) ok("NavGrid 는 받은 글자만 그린다");
}

// ── 4-3) 눌러야 보이는 무거운 판은 눌러야 내려온다 ──────────────
//
// `isOpen && <StudentPanel …>` 는 **그리기**만 미루고 **받기**는 안 미룬다 —
// 위에서 import 한 순간 같은 뭉치다. 오늘 수업은 브라우저로 가는 자바스크립트의
// 3분의 1이 학생 판이었고, 출결만 찍고 지나가는 날에도 전부 받고 있었다.
// (실측 raw: 오늘 수업 483 → 360kB, 재원생 208 → 123kB)
//
// 되돌아가는 길이 조용하다 — 나중에 「dynamic 이 헷갈린다」 며 평범한 import 로
// 되돌리면 화면은 똑같이 돌고 크기만 도로 는다. 그래서 못 박는다.
console.log("\n== 눌러야 보이는 판이 눌러야 내려오나 ==");
{
  const LAZY = [
    ["app/today/TodayBoard.jsx", "./StudentPanel", "오늘 수업 학생 판"],
    ["app/students/StudentList.jsx", "@/app/progress/StudentBooksProgress", "재원생 진도 판"],
    ["app/students/StudentList.jsx", "./NoteBox", "재원생 상담일지 탭"],
  ];
  let n = 0;
  for (const [f, mod, what] of LAZY) {
    const s = readFileSync(f, "utf8");
    if (new RegExp(`^import .* from "${mod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}";`, "m").test(s)) {
      say(`${f} — ${what}(${mod})을 그냥 가져옵니다. next/dynamic 으로 미루세요 (원칙 6)`);
    } else if (!s.includes(`import("${mod}")`)) {
      say(`${f} — ${what}(${mod})을 부르는 곳이 없습니다. 이 표를 고쳐주세요`);
    } else n++;
  }
  // 기다리는 자리는 `.stuPanel` 이면 안 된다 — 골든 검사가 빈 자리를 판으로 삼는다
  const board = readFileSync("app/today/TodayBoard.jsx", "utf8");
  if (/loading:[\s\S]{0,200}className="stuPanel"/.test(board)) {
    say("오늘 수업 — 기다리는 자리에 .stuPanel 을 쓰면 골든 검사가 빈 자리를 판으로 착각합니다");
  }
  if (!bad) ok(`${n}곳 — 누를 때 받는다`);
}

// ── 4-4) 메뉴를 기다리느라 화면이 멈추지 않나 ──────────────────
//
// 메뉴가 화면 안에 있을 때는 loading.jsx 가 곧바로 나갔다 — 그 틀이 레이아웃
// **아래**에 있었기 때문이다. 메뉴를 뿌리로 올리면 그 틀이 메뉴 **밑**으로
// 들어가서, 배지를 다 셀 때까지 첫 글자 한 자도 안 나간다.
//
// 실측 (같은 조건, 메뉴 조회 0.6초 흉내 · Next 16.3.3):
//   Suspense 없음  첫 바이트 0.611초   Suspense 있음  0.008초 (총 시간은 같다)
//
// Suspense 를 걷어내도 화면은 똑같이 나온다 — 조금 늦게 나올 뿐이라 아무도
// 못 잡는다. 그래서 기계가 본다.
console.log("\n== 메뉴를 기다리느라 첫 글자가 늦지 않나 ==");
{
  const lay = readFileSync("app/layout.jsx", "utf8");
  if (!/<Suspense[\s\S]{0,200}<TopBar \/>/.test(lay)) {
    say("app/layout.jsx — <TopBar /> 가 Suspense 밖입니다. 배지를 다 셀 때까지 첫 글자가 안 나갑니다 (원칙 6)");
  } else ok("메뉴는 흘려보낸다 (Suspense)");
  // 오늘 수업 — 아흔여덟 조회를 다 기다리기 전에 날짜라도 먼저 나가야 한다
  const today = readFileSync("app/today/page.jsx", "utf8");
  if (!/<Suspense[\s\S]{0,900}<TodayBody/.test(today)) {
    say("app/today/page.jsx — 판이 Suspense 밖입니다. 조회 아흔여덟이 다 끝나야 날짜가 보입니다");
  } else ok("오늘 수업 — 날짜부터 먼저");
}

// ── 5) 메뉴를 오갈 때 ────────────────────────────────────────
console.log("\n== 한 번 갔던 화면이 30초 안에는 즉시 뜨나 ==");
const cfg = readFileSync("next.config.mjs", "utf8");
if (!/staleTimes/.test(cfg)) {
  say("next.config 의 staleTimes 가 사라졌습니다 — 메뉴를 오갈 때마다 서버 렌더를 통째로 기다리게 됩니다");
} else ok("staleTimes 유지");
const inbox = readFileSync("lib/inbox.js", "utf8");
if (!/_memo/.test(inbox)) say("lib/inbox 의 메모가 사라졌습니다 — 안 본 알림 세기가 화면마다 다시 돕니다");
else ok("안 본 알림 메모 유지");
// 프로필도 화면마다 다시 읽으면 안 된다 (스물여덟 화면이 그랬다)
let rawProfile = 0;
for (const f of files) {
  if (/from\("profiles"\)\.select\("\*"\)\.eq\("id", user\.id\)\.single\(\)/.test(readFileSync(f, "utf8"))) {
    say(`${f} — 프로필을 직접 읽습니다. lib/profileCache 의 cachedProfile 을 쓰세요 (원칙 6-4)`);
    rawProfile++;
  }
}
if (!rawProfile) ok("프로필 — 전부 60초 기억(cachedProfile)");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요 (docs/PRINCIPLES.md 원칙 6)"); process.exit(1); }
console.log("\n✅ 속도 검사 통과");
