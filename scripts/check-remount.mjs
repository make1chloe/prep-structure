/** 판 안에서 부품을 만들지 않는다 — (어92) · 원장님 2026-09-18 「고르면 스크롤 튐」.
 *
 *  사고: `const Card = ({ c }) => …` 처럼 **판 함수 안에서** 부품을 만들면,
 *  상태가 바뀔 때마다 **부품 갈래가 새것**이 되어 React 가 그 아래를 통째로 부수고 다시 만든다.
 *  → 눌러 둔 체크박스가 사라졌다 살아나고 **스크롤·포커스가 튄다**(원장님이 겪으신 그것).
 *  화면은 멀쩡해 보여서 **눈으로는 절대 못 잡는다** — 그래서 검사가 필요하다.
 *
 *  고치는 법 둘: ① 판 밖(모듈 자리)으로 빼거나 ② **부품이 아니라 함수로 부른다**(`{Card({ c, k })}`).
 *  ②는 DOM 을 한 글자도 안 바꾼다(마크업을 보는 검사·목업 화소 그대로) · 목록이면 열쇠를 뿌리에 단다.
 *  ⚠️ 갈고리(useState 등)를 쓰는 부품은 ②로 못 바꾼다 — 그건 밖으로 빼야 한다. */
import { readFileSync, readdirSync, statSync } from "node:fs"; import { join } from "node:path";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 폰-5 · 줄 수는 지킨다
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith(".js")) out.push(p); } return out; };
const files = walk("app").filter((p) => !p.includes("/api/"));

console.log("■ (어92) 판 안에서 부품을 만들지 않는다 — 만들면 상태가 바뀔 때마다 통째로 다시 그려 스크롤·포커스가 튄다");
const inner = [];
for (const f of files) {
  const s = strip(readFileSync(f, "utf8"));
  /* 들여쓴 `const 대문자이름 = (` 은 판 **안**에서 만든 것이다(모듈 자리는 들여쓰기가 없다).
     ⚠️ `^\s+` 를 쓰면 안 된다 — \s 가 **줄바꿈까지** 먹어서 앞이 빈 줄인 모듈 자리 부품을 안쪽으로 오해한다(2026-09-19 실측). */
  for (const m of s.matchAll(/^[ \t]+const ([A-Z][A-Za-z0-9]*) = \(([^)]*)\)\s*=>\s*[({<]/gm)) {
    const name = m[1];
    /* 그 이름을 **부품으로** 쓰고 있나(<이름 …) — 함수로 부르면({이름({…})}) 갈래가 안 바뀌어 괜찮다 */
    if (new RegExp(`<${name}[\\s/>]`).test(s)) inner.push(`${f}:${name}`);
  }
}
ok("판 안에서 만든 것을 **부품으로 쓰는 자리 0**(함수로 부르거나 밖으로 뺀다)", inner.length === 0, inner.join(" · "));

/* 고친 자리가 되돌아가지 않았나 — 함수로 부르는 꼴이 그대로 있나 */
const CALLS = [["app/schedule/todo/board.js", /Card\(\{ c: x, k: x\.id \}\)/], ["app/schedule/todo/board.js", /Flow\(\{ card:/],
               ["app/ops/files/board.js", /FileRow\(\{ f, bin:/], ["app/me/book/board.js", /Sub\(\{ s, c, k:/],
               ["app/me/cards.js", /Item\(\{ it,/], ["app/today/row.js", /\{N\(\{ k:/],
               ["app/books/videos/board.js", /Video\(\{ v, k: v\.id \}\)/], ["app/me/book/board.js", /Chapter\(\{ c, k: c\.chapter \}\)/]];
const gone = CALLS.filter(([f, re]) => !re.test(strip(readFileSync(f, "utf8")))).map(([f]) => f);
ok(`(어92) 고친 여덟 자리가 그대로다 · 함수로 부른다`, gone.length === 0, [...new Set(gone)].join(", "));

/* 목록이면 열쇠가 있어야 한다 — 함수로 부르면 React 가 경고를 못 내므로 여기서 본다 */
const board = strip(readFileSync("app/schedule/todo/board.js", "utf8"));
ok("목록으로 부르는 것은 **열쇠를 뿌리에** 단다(함수 호출이라 React 가 안 알려 준다)",
   /const Card = \(\{ c, k \}\) => <div key=\{k\}/.test(board)
   && /const FileRow = \(\{ f, bin, k \}\) => <div key=\{k\}/.test(strip(readFileSync("app/ops/files/board.js", "utf8")))
   && /const Sub = \(\{ s, c, k \}\) => <div key=\{k\}/.test(strip(readFileSync("app/me/book/board.js", "utf8")))
   && /const Item = \(\{ it, dim = false, k \}\)/.test(strip(readFileSync("app/me/cards.js", "utf8"))));

/* (어92) 「**잡을 수 있다고 칠한 것은 잡혀야 한다**」 — 원장님 2026-09-18 「이거 기능이 뭐야 대체 · 눌리지도않음」 · 「화살표안보여」.
   손 모양(cursor:grab)·눌린 단추 색을 준 자리는 **진짜로 손이 달려 있어야** 한다. CSS 가 없는 기능을 약속하면 안 된다. */
console.log("\n■ (어92) 잡을 수 있다고 칠한 것은 잡혀야 한다 · 같은 클래스가 한 곳은 단추 한 곳은 아니면 안 된다");
{ const css = readFileSync("app/globals.css", "utf8");
  /* ① cursor:grab 을 준 클래스는 app 어딘가에서 pointer 손이 달려야 한다 */
  const grabs = [...css.matchAll(/^\.([a-z0-9-]+)\{[^}]*cursor:grab/gm)].map((m) => m[1]);
  const all = files.map((f) => strip(readFileSync(f, "utf8"))).join("\n");
  const empty = grabs.filter((c) => {
    const used = new RegExp(`className="[^"]*\\b${c}\\b`).test(all);
    if (!used) return false;                                   // 안 쓰는 클래스는 여기서 안 본다
    const re = new RegExp(`className="[^"]*\\b${c}\\b[^>]{0,400}onPointerDown`);
    return !re.test(all);
  });
  ok(`cursor:grab 을 준 자리는 **진짜로 끌린다**(손잡이에 onPointerDown) · 지금 ${grabs.length}종`, empty.length === 0, empty.join(", "));
  /* ② .nb-hg(숨긴 그룹 머리)는 어디서나 단추다 — 06c 것만 div 라 눌러도 아무 일이 없었다 */
  const hgDiv = files.filter((f) => /<div className="nb-hg"/.test(strip(readFileSync(f, "utf8"))));
  ok("숨긴 그룹 머리(.nb-hg)는 **어디서나 단추**다 · div 0(05 는 단추인데 06c 만 div 였다)", hgDiv.length === 0, hgDiv.join(", "));
  /* ③ 죽은 CSS — app 에 쓰지 않는 draggable 규칙이 globals 에 남으면 「드래그가 있나 보다」로 읽힌다 */
  ok("앱 CSS 에 `[draggable]` 규칙 0(목업 시연용은 겉껍질로 간다 · app 엔 draggable 요소가 없다)", !/\[draggable\]/.test(css));
  /* ④ 05 표 보기에도 보드와 같은 손이 있다(대전제-19·20) */
  const board = strip(readFileSync("app/schedule/todo/board.js", "utf8"));
  ok("05 ⊞표 보기에도 **고르기·✎·마감·삭제**가 있다(보드에서 되는 일이 표에서 안 되면 안 된다)",
     /data-g="table"[\s\S]{0,2500}<PickBox pick=\{pk\}/.test(board) && /data-act="row-edit"/.test(board) && /data-act="row-drop"/.test(board)); }
console.log(`\n■ 다시 그리기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
