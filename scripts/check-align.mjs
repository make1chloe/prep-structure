// 줄이 어긋나지 않나 — **툴바에 나란히 선 단추들**
//
// 원장님 (2026-08-13): 「왜 자꾸 이렇게 줄이 안맞아? … 크기나 정렬 안맞으면
// 거슬리는편」. 실제로 교재 화면의 「＋ 엑셀로 추가」 하나만 10px 내려앉아
// 있었고, 재원생 화면도 같았다.
//
// 까닭은 언제나 같은 모양이다 — 화면 위쪽 툴바(`<div className="row">`)에
// 컴포넌트를 여럿 나란히 놓는데, 그중 하나가 **접힌 단추를 여백 붙은
// 껍데기로 감싸서** 돌려준다. 나머지는 맨 단추라 그 하나만 밀린다.
//
// 인라인 style 은 CSS 로 못 막는다 (스타일시트보다 세다). 그래서 **검사로**
// 막는다. 여백은 단추가 아니라 **줄을 놓는 쪽**이 준다.

import fs from "node:fs";
import path from "node:path";

let bad = 0;
const say = (m) => { console.log(`  ❌ ${m}`); bad++; };
const ok = (m) => console.log(`  ✅ ${m}`);

/** 툴바 한 줄 안에 놓인 컴포넌트 이름들 */
function toolbarChildren(src) {
  const out = [];
  // <div className="row" ...> … </div> 중 **자식이 컴포넌트 태그뿐**인 것
  const re = /<div className="row"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[1];
    if (/<(?:button|input|select|a|span|p|form|label)\b/.test(body)) continue;  // 직접 그린 줄은 대상 아님
    const kids = [...body.matchAll(/<([A-Z][A-Za-z0-9_]*)\b[^>]*\/>/g)].map((x) => x[1]);
    if (kids.length >= 2) out.push({ kids, at: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** 그 컴포넌트 파일 찾기 — 같은 폴더 · components/ · app/ 아래 어디든 */
function findFile(name, fromDir) {
  const tries = [
    path.join(fromDir, `${name}.jsx`),
    path.join(fromDir, `${name}.js`),
    path.join("components", `${name}.jsx`),
  ];
  for (const t of tries) if (fs.existsSync(t)) return t;
  return null;
}

/** 접힌 단추를 **여백 붙은 껍데기**로 감쌌나 */
function wrapsCollapsedButton(src) {
  // return ( <div/… style={{ …margin… }}> <button>…</button> </div> ) — 단추 하나뿐
  const re =
    /return\s*\(\s*<(div|span)\b[^>]*style=\{\{[^}]*margin[^}]*\}\}[^>]*>\s*<button\b(?:(?!<button)[\s\S])*?<\/button>\s*<\/\1>\s*\)/g;
  const m = re.exec(src);
  return m ? src.slice(0, m.index).split("\n").length : null;
}

const pages = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx$/.test(e.name)) pages.push(p);
  }
})("app");

console.log("== 툴바에 나란히 선 단추들이 같은 줄에 있나 ==");
let checked = 0;
for (const f of pages) {
  const src = fs.readFileSync(f, "utf8");
  for (const { kids, at } of toolbarChildren(src)) {
    for (const kid of kids) {
      const kf = findFile(kid, path.dirname(f));
      if (!kf) continue;
      checked++;
      const line = wrapsCollapsedButton(fs.readFileSync(kf, "utf8"));
      if (line) {
        say(
          `${kf}:${line} — 접힌 단추를 여백 붙은 껍데기로 감쌌습니다. ` +
            `${f}:${at} 의 줄에서 이것만 어긋납니다. 껍데기를 벗기고 <button> 만 돌려주세요`
        );
      }
    }
  }
}
if (!bad) ok(`툴바 ${checked}자리 — 저마다 여백을 갖는 단추 없음`);

/**
 * **같은 규칙을 두 번 적어두지 않았나** (원칙 1).
 *
 * 달력이 그랬다 — 대시보드 달력과 달력 화면이 같은 이름(.cal-item …)을 쓰는데
 * globals.css 에 **두 벌**로 적혀 있었다. 뒤엣것이 앞엣것을 덮으니 어느 줄이
 * 실제로 먹는지 알 수 없었고, 한쪽만 고치면 다른 달력이 조용히 달라졌다.
 * 오류는 안 난다. 그래서 기계가 센다.
 */
console.log("\n== 같은 CSS 속성을 두 벌로 적어두지 않았나 ==");
const css = fs.readFileSync("app/globals.css", "utf8");
// 미디어쿼리 안은 뺀다 — 좁은 화면에서 다시 적는 것은 두 벌이 아니라 덧쓰기다
const flat = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");

/**
 * 한 이름을 **여러 곳에 나눠 적는 것 자체는 흠이 아니다** — 「여기까지는
 * 자리, 여기서부터는 색」 처럼 갈라 두면 오히려 읽기 좋다.
 * 문제는 **같은 속성을 두 번** 정할 때다. 그때만 뒤엣것이 앞엣것을 덮고,
 * 한쪽만 고치면 화면이 조용히 어긋난다.
 */
const props = new Map();          // "선택자|속성" → 몇 번
for (const m of flat.matchAll(/^([.#][a-zA-Z][\w-]*)\s*\{([^{}]*)\}/gm)) {
  const sel = m[1];
  for (const line of m[2].split(";")) {
    const name = line.split(":")[0].trim();
    if (!name || name.startsWith("--")) continue;   // 변수는 일부러 덧쓴다
    const key = `${sel}|${name}`;
    props.set(key, (props.get(key) || 0) + 1);
  }
}
const clash = [...props].filter(([, n]) => n > 1);
if (clash.length) {
  clash.forEach(([key, n]) => {
    const [sel, name] = key.split("|");
    say(`${sel} 의 ${name} 이(가) ${n}번 적혀 있습니다 — 뒤엣것이 앞엣것을 덮습니다`);
  });
} else {
  ok(`${props.size}가지 속성이 저마다 한 번만 정해져 있습니다`);
}

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 줄맞춤 검사 통과");
