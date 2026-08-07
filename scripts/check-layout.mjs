/**
 * **넓은 화면에서 자리가 비지 않나** (app/globals.css · /me · /parent)
 *
 * 원장님 (2026-08-07) — 「여백이 너무 많아. 반응형을 유지하면서도,
 * 여백없는 레이아웃 가능하게 해줘. 병렬로 나열해야할듯」
 *
 * 학생·학부모 화면은 폰에 맞춰 560px 한 줄이었다. 폰에서는 그게 맞지만
 * 컴퓨터로 열면 양옆이 통째로 비어 화면의 3분의 2가 논다.
 *
 * **반응형을 지키는 것이 조건이다.** 넓게 만든다고 폰에서 두 줄이 되면
 * 글씨가 손톱만 해진다 — 그건 고친 것이 아니라 망가뜨린 것이다.
 * 좁을 때 한 줄인지를 여기서 못 박는다.
 *
 * 쓰는 법:  node scripts/check-layout.mjs
 */
import { readFileSync } from "node:fs";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const css = readFileSync("app/globals.css", "utf8");

console.log("== 좁으면 한 줄, 넓으면 나란히 ==");
// 기본값이 한 줄이어야 한다 — 미디어 쿼리는 **넓어질 때만** 켠다.
// 반대로 짜면(기본 두 줄 + 좁을 때 되돌리기) 옛 브라우저에서 폰이 두 줄이 된다
eq(/\.blockgrid \{[^}]*grid-template-columns: 1fr;/.test(css), true, "기본은 한 줄");
eq(/@media \(min-width: \d+px\)\s*\{\s*\.blockgrid \{ grid-template-columns: repeat\(2/.test(css),
   true, "넓어지면 두 줄");
eq(/@media \(min-width: \d+px\)\s*\{\s*\.blockgrid \{ grid-template-columns: repeat\(3/.test(css),
   true, "더 넓으면 세 줄");
// 짧은 칸이 옆의 긴 칸만큼 늘어나면 빈 자리가 더 커진다
eq(/\.blockgrid \{[^}]*align-items: start;/.test(css), true, "칸은 제 내용만큼만 높다");

console.log("\n== 폭을 다 쓰는 칸 ==");
eq(css.includes(".blockgrid .fullrow"), true, "가로로 넓어야 하는 칸을 위한 자리");

console.log("\n== 화면이 실제로 쓰고 있나 ==");
// css 만 있고 화면이 안 쓰면 아무 일도 안 일어난다
const me = readFileSync("app/me/page.jsx", "utf8");
eq(me.includes('className="blockgrid"'), true, "학생 화면이 쓴다");
// 「지금 할 것」 은 큰 글씨·큰 버튼으로 하나만 보여주는 칸이다. 반쪽으로
// 접히면 그 뜻이 사라진다
eq(me.includes('"study" ? "fullrow"'), true, "「지금 할 것」 은 폭을 다 쓴다");
// 본 화면의 폭을 열어두지 않으면 grid 를 짜봐야 560px 안에서 접힌다
// (안내만 뜨는 작은 화면은 560 그대로 둔다 — 거기는 읽을 글 한 줄이 전부다)
eq(me.includes("maxWidth: 1180"), true, "학생 본 화면의 폭이 열려 있다");

const pa = readFileSync("app/parent/page.jsx", "utf8");
eq(pa.includes('className="blockgrid"'), true, "학부모 화면이 쓴다");
eq(pa.includes('"today" ? "fullrow"'), true, "「오늘」 은 폭을 다 쓴다");
eq(pa.includes("maxWidth: 1180"), true, "학부모 본 화면의 폭이 열려 있다");

if (fail) { console.log("\n❌ 화면 배치에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 화면 배치 통과");
