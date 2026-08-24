import { readFileSync } from "node:fs";

/**
 * **폰 전면 시트가 규칙대로 서 있나** (2026-08-24).
 *
 * 계획을 여섯 판 고치며 검증한 결과 「이것만은 어기면 안 된다」 로 남은 것들이다.
 * 사람이 기억해서 지킬 수 있는 종류가 아니라 — 어기면 회전할 때 화면이
 * 얼어붙거나, 다른 일곱 화면이 같이 전면 시트가 되거나, 당겨서 새로고침이
 * 적던 것을 날린다. 그래서 검사로 못 박는다.
 */
const read = (p) => readFileSync(p, "utf8");
const css = read("app/globals.css");
const noComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };

// ── ① 시트는 「열렸다」 표시로만 켠다 (미디어쿼리로 켜면 회전에 찢어진다)
const sheetLines = noComment
  .split("\n")
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => l.includes(".stusheet"));
ok(sheetLines.length > 0, "시트 규칙(.stusheet)이 아예 없습니다");
for (const [n, l] of sheetLines) {
  if (l.trim().startsWith("html[data-sheet")) continue;
  if (/^\s*\.stusheet-(head|body|foot)\b/.test(l)) continue;   // 뼈대만 잡는 줄은 허용
  ok(false, `${n}번 줄: 시트 규칙은 html[data-sheet="open"] 로 시작해야 합니다 — ${l.trim().slice(0, 60)}`);
}

// ── ② 다른 화면까지 시트가 되면 안 된다
ok(!/html\[data-sheet="open"\][^{]*\.stuPanel\s*\{/.test(noComment),
   ".stuPanel 자체를 시트로 만들면 안 됩니다 (여덟 화면이 같이 씁니다) — .stusheet 를 따로 붙이세요");

// ── ③ 몸통 잠금은 overflow 하나뿐 (position:fixed 로 묶으면 회전·키보드에서 얼어붙는다)
const lockBlock = (noComment.match(/html\[data-sheet="open"\][^{]*\{[^}]*\}/g) || []).join("\n");
ok(/overflow:\s*hidden/.test(lockBlock), "시트가 열리면 뒤 스크롤을 overflow:hidden 으로 막아야 합니다");
ok(!/html\[data-sheet="open"\][^{]*body[^{]*\{[^}]*position:\s*fixed/.test(noComment),
   "몸통을 position:fixed 로 묶으면 안 됩니다 (회전·키보드에서 화면이 얼어붙습니다)");

// ── ④ 새 버전 알림 띠(z 60)는 시트 위에 남아야 한다
const z = noComment.match(/html\[data-sheet="open"\]\s*\.stusheet\s*\{[^}]*z-index:\s*(\d+)/);
ok(z && Number(z[1]) < 60, `시트 z-index 는 60(새 버전 띠)보다 낮아야 합니다 — 지금 ${z ? z[1] : "없음"}`);

// ── ⑤ 당김 새로고침·메뉴 접힘이 시트를 알아야 한다 (한 번 물렸던 회귀)
ok(read("components/PullToRefresh.jsx").includes('dataset.sheet === "open"'),
   "당겨서 새로고침이 시트를 안 봅니다 — 시트를 쓸어내리면 페이지가 통째로 새로고침됩니다");
ok(read("components/NavScroll.jsx").includes('dataset.sheet === "open"'),
   "위 메뉴 접힘이 시트를 안 봅니다");

// ── ⑥ 판에 나가는 길과 돌아올 자리
const panel = read("app/today/StudentPanel.jsx");
ok(/onClose/.test(panel), "판에 닫는 길(onClose)이 없습니다 — 시트에서는 학생 이름줄이 가려집니다");
ok(/stusheet-head[\s\S]{0,900}row\.student\.name/.test(panel),
   "시트 머리에 학생 이름이 없습니다 — 누구 판인지 알 수 없습니다");
const board = read("app/today/TodayBoard.jsx");
ok(/data-row=/.test(board), "줄에 data-row 표식이 없습니다 — 닫은 뒤 그 자리로 돌아갈 수 없습니다");
ok(/scroll-margin-top/.test(css), ".stuRow 에 scroll-margin-top 이 없습니다 — 닫으면 그 줄이 고정 메뉴 뒤로 갑니다");

if (bad.length) {
  console.log("❌ 시트 규칙:");
  bad.forEach((b) => console.log("   ·", b));
  process.exit(1);
}
console.log(`✅ 폰 시트 규칙 통과 (규칙 ${sheetLines.length}줄)`);
