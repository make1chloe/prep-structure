/** 배색 검사 — 앱 CSS 의 토큰을 **여섯 자리**(기본 밝음·어두움 · 종이 · 밝게 · 먹 · 따뜻하게)에서 본다.
 *    1. 갈색 금지(확정-㊽) — 따뜻한 색상이 중간 밝기로 눌린 토큰이 하나라도 있으면 실패
 *    2. 글씨 대비 4.5(디자인-5) — 글씨 토큰은 제 바탕 위에서. 보조 글씨(mute) 3.5 · 부품 테두리·색 3
 *    3. 어두움 두 벌(prefers-color-scheme · data-theme=dark)이 같은 토큰인지 — 하나만 고치면 둘이 갈린다
 *  DB 필요 없음. 토큰 값은 목업에서 온 것이라(check-mockup) 여기서 잡히면 목업을 고친다. */
import fs from "node:fs";
import { tokens, rgb, contrast, isBrown } from "./_css.mjs";
const css = fs.readFileSync("app/globals.css", "utf8");
const map = tokens(css);
const pick = (re) => { const o = {}; for (const [k, v] of map) if (re.test(k)) Object.assign(o, v); return o; };
const base = pick(/^§:root$/);
const darkMedia = { ...base, ...pick(/^@media[^§]*prefers-color-scheme: ?dark[^§]*§:root:not\(\[data-theme="light"\]\)$/) };
const darkAttr = { ...base, ...pick(/^§:root\[data-theme="dark"\]$/) };
const skin = (n) => ({ ...base, ...pick(new RegExp(`^§html\\[data-skin="${n}"\\]$`)) });
const sets = { "기본 밝음": base, "기본 어두움": darkMedia, 종이: skin("paper"), 밝게: skin("bright"), 먹: skin("ink"), 따뜻하게: skin("warm") };
const bad = []; let npairs = 0, ncolor = 0;
// 3. 어두움 두 벌 같은가
for (const k of new Set([...Object.keys(darkMedia), ...Object.keys(darkAttr)])) if (darkMedia[k] !== darkAttr[k]) bad.push(`어두움 두 벌이 다름: ${k} media=${darkMedia[k]} attr=${darkAttr[k]}`);
const TEXT = [["ink","surface"],["ink","ground"],["ink","sunk"],["mid","surface"],["faint","surface"],["on-navy","navy"],["surface","miss"],["miss","surface"],["ok","surface"],["navy","surface"],
  ...["ok","miss","weak","amber","violet","pink","cyan"].flatMap(c => [[`on-${c}`, `${c}-fill`], ["ink", `${c}-wash`]])];
const SOFT = [["mute","surface"]];                 // 보조 글씨 3.5
const UI = [["edge","surface"],["violet","surface"],["pink","surface"],["cyan","surface"]]; // 테두리·표식 3 (노랑·주황은 채움·띠라 경계가 아니다 — 글씨는 on-weak·on-amber 로 잰다)
for (const [name, tok] of Object.entries(sets)) {
  for (const [k, v] of Object.entries(tok)) { const c = rgb(v); if (!c) continue; ncolor++; if (isBrown(c)) bad.push(`갈색 [${name}] ${k}: ${v}`); }
  const need = (pairs, min, what) => { for (const [f, b] of pairs) { const a = rgb(tok[`--${f}`]), c = rgb(tok[`--${b}`]); if (!a || !c) { bad.push(`토큰 없음 [${name}] --${f} / --${b}`); continue; } npairs++; const r = contrast(a, c); if (r < min) bad.push(`${what} 대비 ${r.toFixed(2)} < ${min} [${name}] --${f} on --${b}`); } };
  need(TEXT, 4.5, "글씨"); need(SOFT, 3.5, "보조 글씨"); need(UI, 3, "부품");
}
if (bad.length) { console.log("check-palette ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-palette ✓ 배색 ${Object.keys(sets).length}자리 · 색 토큰 ${ncolor} 갈색 0 · 대비 ${npairs}쌍 · 어두움 두 벌 같음`);
