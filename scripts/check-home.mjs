/**
 * **들어가면 자기 자리로, 대시보드는 알림센터** (2026-08-07)
 *
 * 원장님
 *   「로그인시 원장 첫화면은 대시보드로 고정하고, 대시보드 메뉴가 두개인것도
 *    하나만 살리고」
 *   「대시보드는 미확인 요청이 모두 보여야돼. 일종의 알림센터 기능을 포함해
 *    화면 효율적으로」
 *   「대시보드에서 액션으로 이어지는 것도 고려해야해. 읽고 다른 화면 가면
 *    내용을 잊어버려. 보강추가, 할일추가 그런거 있어야해」
 *
 * 쓰는 법:  node scripts/check-home.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 들어가면 자기 자리로 ==");
const login = read("app/login/page.jsx");
/**
 * 예전에는 누구든 `/me` 였다. 원장님은 「학생이 없습니다」 를 보시고 다시
 * 대시보드로 옮겨 가셔야 했다 — 「원장 로그인하면 학생 화면이 나와」 의
 * 진짜 원인이 계정 역할이 아니라 **여기**였다.
 */
eq(/principal:\s*"\/"/.test(login), true, "원장은 대시보드로");
eq(/parent:\s*"\/parent"/.test(login), true, "학부모는 학부모 화면으로");
eq(/student:\s*"\/me"/.test(login), true, "학생은 학생 화면으로");
// 역할을 못 읽어도 로그인은 된 것이다 — 막다른 곳으로 보내면 안 된다
eq(login.includes('|| "/me"'), true, "모르면 학생 쪽으로 (거기서 갈린다)");
eq(/router\.push\("\/me"\);\s*\n\s*router\.refresh\(\);/.test(login), false,
   "자리를 하나로 박아두던 것이 남아 있다");
// 대시보드에 들어온 어머니는 학부모 화면으로 (학생 화면은 자녀 고르기를 한 번 더 거친다)
eq(read("app/page.jsx").includes('if (profile?.role === "parent") redirect("/parent")'), true,
   "대시보드에 온 학부모는 학부모 화면으로");

console.log("\n== 메뉴 — 가로 두 줄, 내려가면 대메뉴만 ==");
/**
 * 원장님 (2026-08-07) — 「메뉴를 가로로 배치하는 건 어때? 아래로
 * 스크롤하면 대메뉴만 나오고 많이 올라가면 소메뉴 나오고」
 *
 * 세 번째 모양이다. 앞의 둘이 왜 안 됐는지를 같이 못 박아둔다 —
 *   1) 한 줄로 흘리기  → 화면 너비에 따라 **묶음이 줄 중간에서 갈라졌다**
 *   2) 묶음마다 한 줄  → 갈라지진 않는데 **줄이 여덟**이라 붙여둘 수가 없었다
 */
/**
 * 위 메뉴는 두 조각이다 (성능수리 3차) — **세는 쪽**(TopBar, 서버)과
 * **그리는 쪽**(NavGrid, 브라우저). 「지금 여기」 표시가 화면을 옮길 때
 * 따라와야 해서 갈랐다 (뿌리 레이아웃은 화면을 옮겨도 다시 안 그려진다).
 * 검사는 **위 메뉴 전체**를 보는 것이 뜻이므로 둘을 붙여서 본다 —
 * 한쪽만 보면 나머지 반쪽이 사라져도 초록으로 뜬다.
 */
const bar = read("components/TopBar.jsx") + read("components/NavGrid.jsx");
eq(/className=\{`navcol \$\{row\.solo \? "solo" : ""\}`\}/.test(bar), true, "묶음 하나가 한 칸이다");
eq(bar.includes('className="navitems"'), true, "그 칸 안에 소메뉴가 들어간다");
// 「대시보드 대시보드」 — 묶음 안에 화면이 없으면 이름이 두 번 나왔다
eq(/r\.items\[0\]\.label === r\.label/.test(bar), true,
   "하위가 없는 묶음은 이름 칸이 곧 그 화면");
eq(bar.includes("row.solo ? row.solo.href"), true, "그 이름을 누르면 그 화면으로");
// 지금 어느 묶음에 있는지 대메뉴에서 보여야 한다 (소메뉴가 접혀 있을 때 특히)
eq(bar.includes("sectionOf(active) === row.group"), true, "지금 묶음이 대메뉴에 표시된다");

const css = read("app/globals.css");
// **소메뉴는 세로로 선다** — 가로로 흘리면 어느 묶음 것인지 알 수가 없었다
// 폰 — 이름 아래로 세로 (원장님, 2026-08-07 — 「모바일은 지금이 좋아」)
eq(/^\.navitems \{[^}]*flex-direction: column/m.test(css), true, "폰에서는 소메뉴가 세로로 선다");
eq(/^\.navcol \{[^}]*flex-direction: column/m.test(css), true, "묶음 한 칸은 안 갈라진다");
/**
 * 컴퓨터 — 이름과 소메뉴를 **나란히**, 여러 묶음을 한 줄에 (원장님,
 * 2026-08-07 — 「PC는 생각보다 여백이 많은데 … 원래랑 비슷한데 정렬이
 * 안 된 느낌이었어서」).
 *
 * 격자여야 **정렬이 맞는다.** 그냥 흘리면 폭이 제각각이라 줄이 어긋나
 * 보이고, 그게 원장님이 걸리셨던 바로 그 느낌이다.
 */
eq(/@media \(min-width: 901px\)[\s\S]{0,400}display: grid/.test(css), true,
   "컴퓨터에서는 격자로 앉힌다");
eq(/\.navcol \{ display: contents; \}/.test(css), true,
   "칸 껍데기를 없애야 이름과 소메뉴가 격자에 직접 앉는다");
// 넓이에 따라 한 줄에 두 · 세 · 네 묶음 — 하나로 박으면 좁은 쪽은 넘치고
// 넓은 쪽은 오른쪽이 통째로 빈다
for (const [w, n] of [["901px", 2], ["1150px", 3], ["1400px", 4]]) {
  eq(new RegExp(`min-width: ${w}\\)[\\s\\S]{0,400}repeat\\(${n}, max-content auto\\)`).test(css), true,
     `${w} 부터 한 줄에 ${n}묶음`);
}
// 하위가 없는 묶음(대시보드)이 한 칸만 쓰면 그 옆에 넓은 빈자리가 남는다
eq(/\.navcol\.solo \.navgroup-tag \{ grid-column: span 2/.test(css), true,
   "대시보드는 두 칸을 차지한다");
// 접히면 이름만 남는다 — 격자 빈 칸이 그대로면 여덟 개가 세 줄로 흩어진다
eq(/:root\[data-nav="compact"\] \.navgrid \{ display: flex/.test(css), true,
   "접히면 이름만 한 줄로 모인다");
// 접는 것은 <html> 표시로 — 머리말이 다시 그려져도 안 날아가야 한다
eq(css.includes(':root[data-nav="compact"] .navitems'), true, "접히면 소메뉴가 숨는다");
eq(read("components/NavScroll.jsx").includes("root.dataset.nav"), true,
   "표시를 <html> 에 붙인다 (다시 그려도 안 날아간다)");
/**
 * **접을 때 글이 튀면 안 된다.**
 *
 * sticky 는 자리를 차지한 채 붙는다 — 굴리는 도중에 머리말을 접으면 문서가
 * 짧아지고 읽던 자리가 위로 훅 튄다. 손가락은 가만히 있는데 글이 움직이니
 * 그 자체로 고장처럼 느껴진다. fixed 로 띄우고 빈자리를 미리 잡아둔다.
 */
eq(/\.topbar \{[^}]*position: fixed/.test(css), true, "머리말은 띄워둔다 (fixed)");
eq(/body \{ padding-top: var\(--topbar-full/.test(css), true, "그만큼 빈자리를 잡아둔다");
eq(read("components/TopBarHeight.jsx").includes("--topbar-full"), true,
   "펴진 높이를 재서 알려준다");
// 접힌 채로 재면 맨 위에서 메뉴가 글을 덮는다
eq(read("components/TopBarHeight.jsx").includes('root.dataset.nav === "compact"'), true,
   "접혔을 때와 펴졌을 때를 따로 잰다");
/**
 * **컴퓨터에서는 가리키기만 해도 나온다** (원장님, 2026-08-07 —
 * 「PC에서는 마우스가 그리로 가면 소메뉴 나오게」).
 *
 * `hover: hover` 로 가르는 것이 중요하다. 폰에서 :hover 는 **누른 뒤에
 * 남는다** — 한 번 누르면 메뉴가 펴진 채로 안 접히고, 다른 데를 눌러야
 * 없어진다. 그러면 굴려서 접는 뜻이 없어진다.
 */
eq(/@media \(hover: hover\) and \(pointer: fine\)/.test(css), true,
   "마우스가 있는 기기에서만 (폰에서 :hover 는 눌린 채로 남는다)");
eq(/:root\[data-nav="compact"\] \.topbar:hover \.navitems \{ display: flex/.test(css), true,
   "갖다 대면 소메뉴가 나온다");

console.log("\n== 대시보드에서 바로 처리 ==");
const q = read("app/QuickBar.jsx");
eq(q.includes("setMakeup"), true, "보강을 여기서 잡는다");
eq(q.includes("addTask"), true, "할일을 여기서 넣는다");
// **화면을 옮기지 않는다.** 읽던 자리로 돌아와야 방금 읽은 것이 안 흐려진다
eq(q.includes("router.push"), false, "저장했다고 다른 화면으로 보내지 않는다");
eq(q.includes("router.refresh"), true, "그 자리에서 새로 읽는다");
// 접어둔다 — 늘 펴져 있으면 매일 여는 화면 맨 위를 입력칸이 차지한다
eq(q.includes("useState(null)"), true, "접혀 있다가 누르면 펴진다");
eq(read("app/page.jsx").includes("<QuickBar"), true, "대시보드에 있다");

console.log("\n== 답할 것은 대시보드에 ==");
/**
 * 보강을 잡고 무르는 일은 출결 화면으로 옮겼다. 그런데 어머니가 「그날
 * 시험이라 안 돼요」 하고 누르신 것은 **답할 일**이라, 대시보드에 없으면
 * 그 보강은 잡힌 채로 지나간다.
 */
eq(read("app/page.jsx").includes('<MakeupAnswers only="changed"'), true,
   "보강 변경 요청은 대시보드에");
const ans = read("app/MakeupAnswers.jsx");
eq(ans.includes('only === "changed" ? all.filter((r) => r.makeup_change_req)'), true,
   "대시보드에는 답할 것만 (확정된 것까지 늘어놓으면 묻힌다)");
eq(read("app/plan/page.jsx").includes("<MakeupAnswers />"), true, "전부 보는 자리는 출결");

console.log("\n== 없는 것은 안 그린다 ==");
// 「없습니다」 한 줄도 제목·테두리까지 하면 카드 하나다. 대여섯이면 정작
// 온 것 하나를 보려고 화면을 한참 내려야 한다
eq(read("app/RequestInbox.jsx").includes("if (live.length === 0 && past.length === 0) return null"),
   true, "온 알림도 지난 것도 없으면 카드째 안 그린다");
// live = 낙관 반영본 (2026-08-21 「버튼이 작동이 너무 늦어」 — 방금 처리한 줄을 바로 뺀다)
eq(read("app/InquiryInbox.jsx").includes("if (live.length === 0) return null"), true,
   "신규 상담도 마찬가지");
for (const p of ["app/UnsentBox.jsx", "app/WarningInbox.jsx"]) {
  eq(read(p).includes("return null"), true, `${p} 도 빈 카드를 안 그린다`);
}

console.log("\n== 위 메뉴는 뿌리에 한 번 (성능수리 3차) ==");
/**
 * 서른 화면이 저마다 `<TopBar>` 를 그리고 있었다 — 가벼운 화면일수록
 * 조회의 대부분이 메뉴 몫이었다 (반·학생 배정 28 중 22). 뿌리 레이아웃으로
 * 올리면 화면을 옮길 때 그 스물두 자리가 통째로 안 돈다.
 *
 * 되돌아가는 길은 조용하다 — 새 화면을 만들며 `<TopBar>` 를 한 줄 붙이면
 * **메뉴가 두 줄**로 뜨고, 그 화면만 다시 스물두 조회가 된다.
 */
eq(read("app/layout.jsx").includes("<TopBar />"), true, "뿌리 레이아웃이 그린다");
{
  const dup = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const q = `${d}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules|\.next/.test(e.name)) walk(q); }
      else if (/\.jsx$/.test(e.name) && q !== "app/layout.jsx" && /<TopBar\b/.test(read(q))) dup.push(q);
    }
  };
  walk("app");
  eq(dup, [], "화면이 메뉴를 또 붙이지 않는다 (붙이면 두 줄이 된다)");
}
/**
 * **「지금 여기」 와 「메뉴를 붙일 화면인가」 는 브라우저가 판정한다.**
 * 뿌리 레이아웃은 화면을 옮겨도 다시 안 그려진다 (실측: Next 16.3.3 소프트
 * 이동 시 layout 재렌더 0회). 서버에서 정해 넣으면 **첫 화면 값으로 굳어서**
 * 오늘 수업이 계속 하얗게 떠 있고, 원장님이 여신 학생 미리보기 위에
 * 선생님 메뉴가 얹힌다. 오류는 안 난다.
 */
eq(read("components/NavGrid.jsx").includes("usePathname()"), true, "지금 여기는 주소로 판정한다");
eq(read("components/TopBarGate.jsx").includes("usePathname()"), true, "메뉴를 붙일 화면인가도 주소로");
// 안 붙일 화면 목록을 두 벌로 적으면 화면 하나 늘릴 때 한쪽만 고치게 된다
eq(read("components/TopBarGate.jsx").includes("canOpen(null,"), true,
   "안 붙일 곳은 lib/roles 의 목록 그대로 (두 벌 금지)");
// 로딩 화면이 메뉴 높이 빈 상자를 다시 그리면 진짜 메뉴 밑에 회색 띠가 하나 더 붙는다
eq(/height: "var\(--topbar/.test(read("app/loading.jsx")), false, "로딩은 메뉴 흉내를 안 낸다");

if (fail) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 첫 화면 · 알림센터 통과");
