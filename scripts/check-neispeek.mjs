/**
 * **「나이스 원본」 표가 진짜로 그려지나** (원장님, 2026-08-09 — 「나이스 일정
 * 페이지를 만들어서 순수하게 나이스에 입력된 일정을 전수 볼 수 있게 해줘」).
 *
 * ── 왜 이 검사가 따로 필요한가 ──────────────────────────
 *
 * 나이스는 이 컨테이너에서 막혀 있어서, 브라우저로 눌러봐도 **표가 그려지는
 * 자리까지 못 간다.** 그런데 빌드가 통과해도 화면은 터질 수 있다는 것을
 * 이번에 겪었다 (ExamRow 를 엉뚱한 함수 안에 넣어 화면이 통째로 터졌는데
 * `next build` 는 통과했다).
 *
 * 그래서 화면 조각을 **가짜 줄로 직접 그려본다.** 앱 코드는 그대로 두고,
 * 서버 액션을 부르는 자리만 검사 쪽에서 바꿔 끼운다 —
 * **앱에 테스트용 뒷문을 만들지 않는다.**
 *
 * 쓰는 법:  node scripts/check-neispeek.mjs
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "next/dist/build/swc/index.js";

let fail = 0;
const ok = (cond, what) => {
  if (!cond) { console.log(`  ✗ ${what}`); fail = 1; }
};

const src = readFileSync("app/neis/NeisPeek.jsx", "utf8")
  // 서버 액션은 여기서 부를 수 없다 — 부르지 않는 가짜로 바꿔 끼운다
  .replace(/import \{ peekNeis \} from "[^"]+";/, "const peekNeis = async () => ({ rows: [] });")
  .replace(/from "@\/lib\/schoolName"/, 'from "./lib/schoolName.js"')
  .replace(/^"use client";\s*/m, "");

const out = await transform(src, {
  filename: "NeisPeek.jsx",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2020",
         transform: { react: { runtime: "automatic" } } },
  module: { type: "es6" },
});
// **repo 안에** 두어야 react 를 찾는다 (밖에 두면 node 가 못 푼다)
const file = ".neispeek.check.mjs";
writeFileSync(file, out.code);
const mod = await import(pathToFileURL(resolve(file)).href)
  .finally(() => rmSync(file, { force: true }));
const { default: NeisPeek, PeekTable } = mod;

/** 나이스가 줄 법한 답 — 갈래마다 한 줄씩, 어긋난 줄도 섞어서 */
const rows = [
  { school: "해송고", date: "2026-10-14", raw: "1회고사", event: "2학기 중간고사",
    sbtr: null, grades: [1, 2, 3], how: "시험", inApp: true, hasExam: true },
  { school: "박문중", date: "2026-10-13", raw: "2학기 중간", event: "2학기 중간고사",
    sbtr: null, grades: [], how: "시험", inApp: false, hasExam: false },
  { school: "연수여고", date: "2026-11-19", raw: "대수능시험 휴업일", event: null,
    sbtr: "휴업일", grades: [], how: "전국", inApp: null, hasExam: null },
  { school: "신정중", date: "2026-10-17", raw: "토요휴업일", event: null,
    sbtr: "휴업일", grades: [], how: "버림", inApp: null, hasExam: null },
  { school: "은송중", date: "2026-09-21", raw: "재량휴업일", event: null,
    sbtr: null, grades: [], how: "쉼", inApp: true, hasExam: null },
];

console.log("== 표가 그려지나 ==");
let html = "";
try {
  html = renderToStaticMarkup(
    createElement(NeisPeek, { from: "2026-03-01", to: "2027-02-28", schools: [] })
  );
} catch (e) {
  console.log(`  ✗ 첫 화면에서 터집니다 — ${e.message}`);
  process.exit(1);
}
ok(html.includes("나이스에 물어보기"), "물어보는 단추가 있다");
ok(!html.includes("undefined"), "빈 값이 화면에 새어 나오지 않는다");

/**
 * **결과가 온 뒤를 진짜로 그려본다.** 표를 따로 떼어 두었기 때문에, 나이스가
 * 막힌 곳에서도 가짜 줄로 그릴 수 있다.
 */
console.log("\n== 결과가 왔을 때 (표를 진짜로 그려본다) ==");
let tbl = "";
try {
  tbl = renderToStaticMarkup(createElement(PeekTable, { rows }));
} catch (e) {
  console.log(`  ✗ 표에서 터집니다 — ${e.message}`);
  process.exit(1);
}
// 나이스에 적힌 이름이 **그대로** 나온다 (편 이름은 옆에)
ok(tbl.includes("1회고사"), "나이스에 적힌 이름 그대로");
ok(tbl.includes("2학기 중간고사"), "우리가 편 이름도 옆에");
ok(tbl.includes("토요휴업일") && tbl.includes("버림"), "버리는 줄도 숨기지 않는다");
ok(tbl.includes("(휴업일)"), "수업공제일명도 보여준다");
ok(tbl.includes("1·2·3"), "학년 칸");
// **어긋난 줄** — 이 화면의 존재 이유
ok(tbl.includes("안 들어옴") || tbl.includes("회차 없음"), "앱에 안 들어온 줄을 짚는다");
ok(!tbl.includes("undefined"), "빈 값이 새어 나오지 않는다");
// 학교 이름은 줄여서 (인천해송고등학교 → 해송고)
ok(tbl.includes("해송고"), "학교 이름은 줄여서");
// 빈 목록도 안 터진다
ok(renderToStaticMarkup(createElement(PeekTable, {})).includes("나이스에 적힌 이름"),
   "줄이 하나도 없어도 안 터진다");

const withRows = readFileSync("app/neis/NeisPeek.jsx", "utf8");
// 갈래마다 다른 색을 준다 — 눈으로 훑을 때 시험만 골라 보게
ok(/HOW_CLS = \{/.test(withRows), "갈래마다 색이 다르다");
["시험", "전국", "쉼", "행사", "버림"].forEach((k) =>
  ok(new RegExp(`${k}:`).test(withRows) || withRows.includes(`"${k}"`), `「${k}」 갈래를 그린다`)
);
// **어긋난 줄을 눈에 띄게** — 이 화면의 존재 이유다
ok(/안 들어옴/.test(withRows), "나이스엔 있는데 앱엔 없는 줄을 표시한다");
ok(/회차 없음/.test(withRows), "시험인데 회차가 없는 줄을 표시한다");
ok(/앱에 안 들어온 것만/.test(withRows), "어긋난 줄만 골라 볼 수 있다");
// 나이스가 준 이름을 **그대로** 보여준다 (편 이름은 옆에)
ok(/\{r\.raw\}/.test(withRows), "나이스에 적힌 이름을 그대로 보여준다");
ok(/r\.event &&/.test(withRows), "편 이름은 다를 때만 옆에 붙인다");
// 0줄인 학교의 까닭도 그대로
ok(/res\.notes\?\.length/.test(withRows), "나이스가 뭐라고 했는지도 적어준다");

// 가짜 줄이 표 만드는 규칙에 안 걸리는지 (거르기 · 자르기)
console.log("\n== 거르기 ==");
const gaps = rows.filter((r) => r.inApp === false || r.hasExam === false);
ok(gaps.length === 1 && gaps[0].school === "박문중", "어긋난 줄 세기");
const exams = rows.filter((r) => r.how === "시험");
ok(exams.length === 2, "시험만 세기");

if (fail) { console.log("\n❌ 나이스 원본 화면에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 나이스 원본 화면 통과");
