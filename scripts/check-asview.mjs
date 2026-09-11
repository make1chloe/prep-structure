/** 👁 「그 아이 화면을 그대로 본다」 검사(글자) — 원장님 2026-09-11 「학생 학부모기능 없고」.
 *  아이·학부모 화면 여섯은 지어져 있었는데 **원장님이 열 길이 없어** 없는 것으로 보였다. 길을 냈으니 이제 그 길이 새지 않는지 본다.
 *  ① 판단은 lib/asview.js 한 곳 — 화면이 제 손으로 「직원인가」를 다시 판단하지 않는다(원칙-1)
 *  ② 직원만 — asView 가 isStaff 를 지난다(아이가 ?as= 를 붙여도 남의 것을 못 본다)
 *  ③ 읽기만 두 겹 — 화면은 fieldset disabled, 손은 역할 문지기. 하나만 있으면 빨강
 *  ④ 여섯 화면이 다 쓴다 — 하나라도 빠지면 그 화면에서 원장님이 튕긴다
 *  ⑤ 들어오는 길 — 14 재원생에 👁 둘
 *  쓰기: node scripts/check-asview.mjs */
import { readFileSync } from "node:fs";
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };

const lib = read("lib/asview.js");
console.log("■ 판단은 한 곳(lib/asview.js)");
ok("lib/asview.js 가 있다", Boolean(lib));
ok("asView 는 isStaff 를 지난다 — 아이·학부모가 ?as= 를 붙여도 제 화면 그대로", /export const asView = .*isStaff\(me\?\.role\)/.test(lib), "직원 거름이 없으면 남의 화면이 새어 나간다");
ok("screenStudent 는 보는 중일 때만 남의 줄을 집는다(아니면 myStudent)", /asView\(me, sp\) \? studentById\(sb, asId\(sp\)\) : myStudent\(sb, user\.id\)/.test(lib));
ok("keepAs 가 있다 — 안쪽 링크가 as= 를 잃지 않는다", /export function keepAs/.test(lib));

console.log("■ 여섯 화면이 다 lib 에서 가져다 쓴다(제 손으로 다시 판단하지 않는다 — 원칙-1)");
const SCREENS = [
  ["app/me/page.js", "아이 07"],
  ["app/me/book/page.js", "내 교재 08"],
  ["app/me/cal/page.js", "아이 달력"],
  ["app/me/videos/page.js", "아이 영상"],
  ["app/parent/page.js", "학부모 09"],
  ["app/parent/cal/page.js", "학부모 달력"],
];
for (const [p, name] of SCREENS) {
  const s = read(p);
  ok(`${name} — asView 를 lib/asview 에서 가져온다`, /from "@\/lib\/asview"/.test(s) && /asView\(me, /.test(s), p);
  ok(`${name} — 보는 중이면 제 역할이 아니어도 안 튕긴다`, /!seeing && me[?.]*\.role !== ROLES\./.test(s) || /!seeing && me\?\.role !== ROLES\./.test(s), `${p}: redirect 가 seeing 을 안 본다`);
  ok(`${name} — 화면이 「직원인가」를 제 손으로 다시 안 본다`, !/searchParams[\s\S]*isStaff\(me[.?]*\.role\) *&& *(Boolean\()?(q|sp)\?\.as/.test(s), p);
}

console.log("■ 읽기만 — 두 겹(화면 fieldset + 손의 역할 문지기)");
for (const [p, name] of [["app/me/page.js", "아이 07"], ["app/parent/page.js", "학부모 09"], ["app/me/book/page.js", "내 교재 08"]]) {
  const s = read(p);
  ok(`${name} — 보는 중에는 <fieldset disabled> 로 통째로 잠근다`, /<fieldset disabled/.test(s) && /data-g="as-locked"/.test(s), p);
}
ok("아이 07·학부모 09 는 「보는 중」 띠를 그린다(화면이 스스로 말한다 · 대전제-0)", ["app/me/page.js", "app/parent/page.js"].every((p) => /<AsBand /.test(read(p))));
ok("띠는 한 벌(app/_shell/asband.js) — 화면마다 안 적는다", /export default function AsBand/.test(read("app/_shell/asband.js")));
const meAct = read("app/me/actions.js"), paAct = read("app/parent/actions.js");
ok("아이 손은 여전히 아이 계정만 — child() 문지기(원장 자격으로는 애초에 못 쓴다)", /w\.me\?\.role !== ROLES\.STUDENT\) throw/.test(meAct), "app/me/actions.js");
ok("학부모 손은 여전히 학부모 계정만", /me\?\.role !== ROLES\.PARENT\) throw/.test(paAct), "app/parent/actions.js");
ok("손에는 as= 가 없다 — 쓰기는 보는 사람이 아니라 **역할**로만 열린다", !/\bas\b *[:=] *(q|sp)\?\.as/.test(meAct + paAct));

console.log("■ 들어오는 길 — 14 재원생");
const board = read("app/ops/students/board.js");
ok("👁 아이 화면 · 👁 학부모 화면 둘이 있다", /href=\{`\/me\?as=\$\{st\.id\}`\}/.test(board) && /href=\{`\/parent\?as=\$\{st\.id\}`\}/.test(board));
ok("「읽기만 됩니다」라고 그 자리에 적혀 있다", /읽기만<\/b> 됩니다/.test(board));

console.log(`\n■ 👁 화면 보기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
