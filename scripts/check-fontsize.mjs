// 글씨가 **읽을 수 있는 크기**인가
//
// 원장님 (2026-08-13): 「전반적으로 글씨 크기 조금만 키워줘 나 노안이라ㅜㅜ」
//
// 한 번 키워놓아도 **다음에 화면 하나 만들 때 또 10px 이 들어온다.** 좁은
// 칸에 우겨넣다 보면 글씨를 줄이는 것이 제일 쉬운 길이라서 그렇다. 그런데
// 그렇게 줄인 글씨는 만든 사람 눈에만 보인다.
//
// 그래서 바닥을 못 박는다 — **12px 아래로는 안 내려간다.** 칸이 좁으면
// 글씨를 줄이지 말고 줄을 접거나(…) 칸을 넓혀야 한다.

import { readdirSync, statSync, readFileSync } from "node:fs";

const FLOOR = 12;
let bad = 0;
const say = (m) => { console.log(`  ❌ ${m}`); bad++; };
const ok = (m) => console.log(`  ✅ ${m}`);

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = `${d}/${f}`;
    if (statSync(p).isDirectory()) { if (!/node_modules|\.next|\.git/.test(f)) walk(p); }
    else if (/\.jsx?$/.test(f)) files.push(p);
  }
})("app");
for (const d of ["components"]) {
  for (const f of readdirSync(d)) if (/\.jsx?$/.test(f)) files.push(`${d}/${f}`);
}

console.log(`== 글씨가 ${FLOOR}px 아래로 내려가지 않나 ==`);

// 1) globals.css
const css = readFileSync("app/globals.css", "utf8");
for (const m of css.matchAll(/font-size:\s*([0-9.]+)px/g)) {
  const v = Number(m[1]);
  if (v < FLOOR) {
    const line = css.slice(0, m.index).split("\n").length;
    say(`app/globals.css:${line} — ${v}px (${FLOOR}px 아래)`);
  }
}

// 2) 화면에 직접 적은 것
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/fontSize:\s*"?([0-9.]+)(?:px)?"?/g)) {
    const v = Number(m[1]);
    if (v < FLOOR) {
      const line = s.slice(0, m.index).split("\n").length;
      say(`${f}:${line} — ${v}px (${FLOOR}px 아래)`);
    }
  }
}

if (!bad) ok(`${FLOOR}px 아래로 내려간 글씨 없음`);

/**
 * **흐린 글씨도 안 보이는 글씨다.** 색을 옅게 하는 것은 크기를 줄이는 것과
 * 같은 일이라, 흐리게 만드는 손쉬운 길(opacity)도 같이 막아둔다.
 */
console.log("\n== 글씨를 너무 흐리게 하지 않나 ==");
for (const m of css.matchAll(/opacity:\s*\.([0-9]+)/g)) {
  const v = Number(`0.${m[1]}`);
  if (v < 0.55) {
    const line = css.slice(0, m.index).split("\n").length;
    say(`app/globals.css:${line} — opacity ${v} (너무 흐립니다. 색으로 말하세요)`);
  }
}
if (!bad) ok("지나치게 흐린 글씨 없음");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 글씨 크기 검사 통과");
