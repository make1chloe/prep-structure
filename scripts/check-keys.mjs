/**
 * **넣는 것은 한 곳, 안 쓰는 것은 뒤로** (2026-08-07)
 *
 * 원장님
 *   「api, 솔라피, 등등 입력값이 필요한걸 한페이지에 모아야하지 않을까?」
 *   「노션이관과 sql db등 웹앱 자체가 완성되고 나면 안쓰는 기능들은 따로 모아줘」
 *   「수업중 동선이 꼬이지 않는지 확인하고 개선해줘」
 *
 * 쓰는 법:  node scripts/check-keys.mjs
 */
import { readFileSync } from "node:fs";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 열쇠는 열쇠끼리 ==");
/**
 * 각각은 그 자리에 있을 이유가 있었다 (나이스는 학사일정을 받는 자리니까).
 * 그런데 **열쇠를 넣으려는 사람은 「어느 화면이었더라」 부터 떠올려야 했다.**
 * 쓰는 자리와 넣는 자리는 다르다 — 넣는 것은 한 번이고 쓰는 것은 매일이다.
 */
const set = read("app/settings/page.jsx");
eq(set.includes("<NeisKeyBox"), true, "나이스 인증키");
eq(set.includes("<AiBox"), true, "AI 키");
eq(set.includes("<SettingsForm"), true, "솔라피 · 웹훅 · 앱 알림");
// 쓰는 자리에는 넣어져 있는지만 보이고, 없으면 오는 길만
eq(read("app/schedule/NeisBox.jsx").includes("saveNeisKey"), false,
   "학교 화면에서 키를 넣던 것이 남아 있다");
eq(read("app/schedule/NeisBox.jsx").includes('href="/settings"'), true,
   "학교 화면에는 설정으로 오는 길");
eq(read("app/settings/sql/page.jsx").includes("<AiBox"), false,
   "SQL 화면에 AI 키가 남아 있다");

console.log("\n== 넣는 것과 정하는 것 ==");
const form = read("app/settings/SettingsForm.jsx");
// 한 화면에 발송방식·앱알림·솔라피·웹훅·문구·보강요일·반성문규칙이 다 있었다
eq(form.includes('const [tab, setTab] = useState("keys")'), true, "연동·키 / 운영 규칙");
// **저장은 하나다.** 두 번 저장하게 만들면 한 번은 잊는다
eq((form.match(/onClick=\{saveAll\}/g) || []).length, 1, "저장 단추는 하나");

console.log("\n== 다 만들고 나면 안 여는 것 ==");
const menu = read("lib/menu.js");
eq(menu.includes('label: "관리자"'), true, "관리자 칸이 있다");
// 없애지는 않는다 — 새 기능을 넣을 때마다 SQL 은 한 번씩 돌려야 한다
eq(menu.includes('href: "/settings/sql"'), false, "SQL 이 메뉴에서 한 칸 뒤로");
eq(menu.includes('href: "/import"'), false, "노션 이관도 한 칸 뒤로");
const admin = read("app/settings/admin/page.jsx");
eq(admin.includes('href: "/settings/sql"'), true, "관리자 안에 SQL");
eq(admin.includes('href: "/import"'), true, "관리자 안에 노션 이관");
// 표가 없으면 그 기능이 **조용히** 안 된다 — 안 돌린 SQL 은 눈에 띄어야 한다
eq(admin.includes("checkSchema"), true, "안 돌린 SQL 이 있으면 알려준다");

console.log("\n== 수업 중 동선 ==");
/**
 * 「결석」 을 누르는 순간 이미 「언제 보강하지」 가 떠오른다. 그런데 잡으려면
 * 출결 화면으로 옮겨 가 학생을 다시 찾고 며칠이었는지 다시 떠올려야 했다.
 * 수업 중에는 그럴 짬이 없고, 나중에 하기로 하면 나중은 오지 않는다.
 */
const panel = read("app/today/StudentPanel.jsx");
eq(panel.includes("<MakeupHere"), true, "결석을 찍은 자리에서 보강까지");
eq(panel.includes('["absent", "online"].includes(form.attendance)'), true,
   "결석·온라인일 때만 열린다");
const mh = read("app/today/MakeupHere.jsx");
// 이미 잡혀 있는데 또 잡으면 그날 오지도 않을 아이가 두 번 뜬다
eq(mh.includes("if (already)"), true, "이미 잡혀 있으면 또 못 잡는다");
eq(read("app/today/page.jsx").includes("makeupOnOf"), true, "잡힌 보강을 읽어 넘긴다");

if (fail) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 열쇠 · 관리자 · 동선 통과");
