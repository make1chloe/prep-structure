// 배색 검사 — 「갈색 금지」(원장님 2026-09-05) + 글씨 대비
//
//   1. 따뜻한 색(색상 20°~75°: 노랑·주황)은 밝기 50% 아래로 못 내려간다 — 어두운 노랑은 갈색이다.
//      글씨로 쓰려고 어둡게 누르는 순간 겨자·카키·똥색이 된다. 글씨는 --warn-fg(남색)로 쓴다.
//   2. 글씨 토큰은 제 바탕 위에서 대비 4.5 이상 — fg/mid/mute on bg·surface, *-fg on *-bg, accent-fg on accent.
//   3. 어두운 벌(--d-*)도 같은 두 가지.
// 읽는 것: app/globals.css 의 :root 블록만 (다른 배색 넷은 원장님이 고르는 것이라 여기서 안 본다).
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root,"), css.indexOf("@media (prefers-color-scheme: dark)"));
const tok = {}; for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) tok[m[1]] = m[2].toUpperCase();
const rgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255);
const hsl = h => { const [r,g,b]=rgb(h); const mx=Math.max(r,g,b), mn=Math.min(r,g,b); const l=(mx+mn)/2; let hh=0; if(mx!==mn){const d=mx-mn; hh=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4; hh*=60; if(hh<0)hh+=360;} return [hh,l]; };
const lum = h => { const c=rgb(h).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
const cr = (a,b) => { const x=lum(a), y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
const bad = [];
// 1·3 갈색 금지 — 바탕(-bg)은 연한 색이라 밝은 쪽에서만 본다
for (const [k,v] of Object.entries(tok)) { const [h,l]=hsl(v); if (h>=20 && h<=75 && !/-bg$|^bg$|^d-bg$|sunk|surface|line/.test(k) && l<0.5) bad.push(`갈색: --${k} ${v} (색상 ${h.toFixed(0)}° 밝기 ${(l*100).toFixed(0)}%)`); }
// 2 대비
const pairs = [["fg","bg"],["fg","surface"],["mid","surface"],["mute","surface"],["mute","bg"],["accent-fg","accent"],["accent","surface"],
  ["ok-fg","ok-bg"],["warn-fg","warn-bg"],["bad-fg","bad-bg"],["info-fg","info-bg"],["off-fg","off-bg"],["ok","surface"],["bad","surface"],["info","surface"],
  ["d-fg","d-bg"],["d-fg","d-surface"],["d-mid","d-surface"],["d-mute","d-surface"],["d-accent-fg","d-accent"],["d-accent","d-surface"],
  ["violet-fg","violet-bg"],["pink-fg","pink-bg"],["cyan-fg","cyan-bg"],["violet","surface"],["pink","surface"],["cyan","surface"],["d-violet-fg","d-violet-bg"],["d-pink-fg","d-pink-bg"],["d-cyan-fg","d-cyan-bg"],["d-ok-fg","d-ok-bg"],["d-warn-fg","d-warn-bg"],["d-bad-fg","d-bad-bg"],["d-info-fg","d-info-bg"],["d-off-fg","d-off-bg"],["d-ok","d-surface"],["d-bad","d-surface"]];
for (const [f,b] of pairs) { if(!tok[f]||!tok[b]) { bad.push(`토큰 없음: --${f} / --${b}`); continue; } const r=cr(tok[f],tok[b]); if (r<4.5) bad.push(`대비 ${r.toFixed(2)}: --${f} on --${b}`); }
if (bad.length) { console.error("check-palette ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-palette ✓ 토큰 ${Object.keys(tok).length} · 갈색 0 · 대비 ${pairs.length}쌍 4.5 이상`);
