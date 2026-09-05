// 배색 검사 — 「갈색 금지」(원장님 2026-09-05) + 글씨 대비
//
//   1. 따뜻한 색(색상 20°~75°: 노랑·주황)은 밝기 50% 아래로 못 내려간다 — 어두운 노랑은 갈색이다.
//      글씨로 쓰려고 어둡게 누르는 순간 겨자·카키·똥색이 된다. 글씨는 --warn-fg(남색)로 쓴다.
//   2. 글씨 토큰은 제 바탕 위에서 대비 4.5 이상 — fg/mid/mute on bg·surface, *-fg on *-bg, accent-fg on accent.
//   3. 어두운 벌(--d-*)도 같은 두 가지.
// 읽는 것: app/globals.css 의 배색 다섯 벌 전부 — 기본 · 기본-어두움 · 종이 · 밝게 · 따뜻하게 (원장님 2026-09-05 「여러 버전 모두」).
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
function tokensOf(block){ const t={}; for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) t[m[1]] = m[2].toUpperCase(); return t; }
const base = tokensOf(css.slice(css.indexOf(":root,"), css.indexOf("@media (prefers-color-scheme: dark)")));
// 배색 벌: 기본(밝음) · 기본-어두움(--d-*) · 종이 · 밝게 · 따뜻하게 (딥네이비는 --d-* 를 그대로 가리킨다)
const sets = { "기본": base, "기본-어두움": Object.fromEntries(Object.entries(base).filter(([k])=>k.startsWith("d-")).map(([k,v])=>[k.slice(2),v])) };
for (const skin of ["paper","bright","warm"]) { const i = css.indexOf(`:root[data-skin="${skin}"]`); if (i<0) { bad.push("배색 블록 없음: "+skin); continue; } const j = css.indexOf("}", i); sets[skin] = { ...tokensOf(css.slice(i, j)) }; }
const rgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255);
const hsl = h => { const [r,g,b]=rgb(h); const mx=Math.max(r,g,b), mn=Math.min(r,g,b); const l=(mx+mn)/2; let hh=0; if(mx!==mn){const d=mx-mn; hh=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4; hh*=60; if(hh<0)hh+=360;} return [hh,l]; };
const lum = h => { const c=rgb(h).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
const cr = (a,b) => { const x=lum(a), y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
const bad = [];
const pairs = [["fg","bg"],["fg","surface"],["mid","surface"],["mute","surface"],["accent-fg","accent"],["accent","surface"],["ok-fg","ok-bg"],["warn-fg","warn-bg"],["bad-fg","bad-bg"],["info-fg","info-bg"],["off-fg","off-bg"],["ok","surface"],["bad","surface"],["info","surface"]];
let npairs = 0;
for (const [name, tok] of Object.entries(sets)) {
  for (const [k,v] of Object.entries(tok)) { const [h,l]=hsl(v); if (h>=20 && h<=75 && /^(warn|weak|amber)$/.test(k) && l<0.5) bad.push(`갈색 [${name}]: --${k} ${v} (색상 ${h.toFixed(0)}° 밝기 ${(l*100).toFixed(0)}%)`); }
  for (const [f,b] of pairs) { if(!tok[f]||!tok[b]) continue; npairs++; const r=cr(tok[f],tok[b]); if (r<4.5) bad.push(`대비 ${r.toFixed(2)} [${name}]: --${f} on --${b}`); }
  for (const [f,b] of [["violet-fg","violet-bg"],["pink-fg","pink-bg"],["cyan-fg","cyan-bg"]]) { if(!tok[f]||!tok[b]) continue; npairs++; const r=cr(tok[f],tok[b]); if (r<4.5) bad.push(`대비 ${r.toFixed(2)} [${name}]: --${f} on --${b}`); }
}
if (bad.length) { console.error("check-palette ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-palette ✓ 배색 ${Object.keys(sets).length}벌 · 갈색 0 · 대비 ${npairs}쌍 4.5 이상`);
