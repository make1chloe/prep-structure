/** 목업 = 앱 검사 — 앱의 겉이 목업과 같은 자인지 **두 가지로** 잰다.
 *    1. 토큰: 목업 <style> 의 --토큰 전부가 app/globals.css 에 같은 자리·같은 값으로 있나(더 있어도 어긋남)
 *    2. 화소: 목업 27화면을 (a) 목업 <style> 로 (b) app/globals.css + chrome.css 로 그려 화면마다 화소를 견준다 — PC 1280 · 폰 390
 *  목업을 고쳤으면 node scripts/mockup-css.mjs 로 다시 갈라낸다. 손으로 globals.css 를 고치면 여기서 잡힌다. */
import fs from "node:fs";
import { tokens, parse } from "./_css.mjs";
import { launch, offline, VIEWS } from "./_browser.mjs";
import { build, styleOf, MOCKUP } from "./_mockup-page.mjs";
const bad = [];
// 1. 토큰
const m = tokens(styleOf(fs.readFileSync(MOCKUP, "utf8"))), a = tokens(fs.readFileSync("app/globals.css", "utf8"));
let ntok = 0;
for (const [k, mv] of m) { const av = a.get(k); for (const [t, v] of Object.entries(mv)) { ntok++; if (!av || av[t] !== v) bad.push(`토큰 다름 ${k.slice(0, 60)} ${t}: 목업 ${v} / 앱 ${av ? av[t] : "없음"}`); } }
for (const [k, av] of a) { const mv = m.get(k) || {}; for (const t of Object.keys(av)) if (!(t in mv)) bad.push(`앱에만 있는 토큰 ${k.slice(0, 60)} ${t}`); }
// 2. 화소
const { orig, app } = build();
const b = await launch();
let nshot = 0;
for (const v of VIEWS) {
  const ctx = await b.newContext({ viewport: v.viewport, hasTouch: v.hasTouch, isMobile: v.isMobile, deviceScaleFactor: 1 }); await offline(ctx);
  const [p1, p2] = [await ctx.newPage(), await ctx.newPage()];
  await p1.goto(orig); await p2.goto(app); await p1.waitForTimeout(300); await p2.waitForTimeout(300);
  for (const p of [p1, p2]) await p.addStyleTag({ content: ".shead{display:none!important}" });
  const ids = await p1.evaluate(() => [...document.querySelectorAll("section.screen:not(#notes)")].map(s => s.id));
  const diffPage = await ctx.newPage();
  for (const id of ids) {
    const shot = async (p) => { const l = p.locator("#" + id); await l.scrollIntoViewIfNeeded(); return l.screenshot(); };
    const [s1, s2] = [await shot(p1), await shot(p2)]; nshot++;
    if (s1.equals(s2)) continue;
    const r = await diffPage.evaluate(async ([u1, u2]) => {
      const img = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
      const [i1, i2] = [await img(u1), await img(u2)];
      if (i1.width !== i2.width || i1.height !== i2.height) return { size: `${i1.width}×${i1.height} / ${i2.width}×${i2.height}` };
      const c = document.createElement("canvas"); c.width = i1.width; c.height = i1.height; const g = c.getContext("2d");
      g.drawImage(i1, 0, 0); const d1 = g.getImageData(0, 0, c.width, c.height).data; g.drawImage(i2, 0, 0); const d2 = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < d1.length; i += 4) if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 30) n++;
      return { pct: n / (d1.length / 4) * 100 };
    }, [`data:image/png;base64,${s1.toString("base64")}`, `data:image/png;base64,${s2.toString("base64")}`]);
    if (r.size) bad.push(`${v.name} #${id} 크기 다름 ${r.size}`); else if (r.pct > 0.05) { bad.push(`${v.name} #${id} 화소 ${r.pct.toFixed(2)}% 다름 (.tmp/diff-*.png)`); fs.writeFileSync(`.tmp/diff-${v.viewport.width}-${id}-a.png`, s1); fs.writeFileSync(`.tmp/diff-${v.viewport.width}-${id}-b.png`, s2); }
  }
  await ctx.close();
}
await b.close();
if (bad.length) { console.log("check-mockup ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-mockup ✓ 토큰 ${ntok} 같음 · 화면 ${nshot / VIEWS.length}장 × ${VIEWS.length}자리 화소 같음`);
