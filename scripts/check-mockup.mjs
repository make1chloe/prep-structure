/** 목업 = 앱 검사 — 앱의 겉이 목업과 같은 자인지 **두 가지로** 잰다.
 *    1. 토큰: 목업 <style> 의 --토큰 전부가 app/globals.css 에 같은 자리·같은 값으로 있나(더 있어도 어긋남)
 *    2. 화소: 목업 27화면을 (a) 목업 <style> 로 (b) app/globals.css + chrome.css 로 그려 화면마다 화소를 견준다 — PC 1280 · 폰 390
 *  목업을 고쳤으면 node scripts/mockup-css.mjs 로 다시 갈라낸다. 손으로 globals.css 를 고치면 여기서 잡힌다. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { tokens, parse } from "./_css.mjs";
import { launch, offline, VIEWS } from "./_browser.mjs";
import { build, styleOf, MOCKUP, ROOT } from "./_mockup-page.mjs";

// ── 안 바뀌었으면 다시 안 잰다 (검사-79 · 2026-09-10)
// ⚠️ 이 검사 하나가 검사 한 바퀴의 대부분을 쓴다 — 목업 27화면 × 2자리 × 2벌 = 스크린샷 108장을 찍어 화소를 견준다.
//    그런데 답을 정하는 것은 아래 일곱 파일뿐이다 — 목업 · globals.css · chrome.css 와 이 검사 넷.
//    앱 코드(app/·lib/·SQL)만 고친 날에는 일곱이 다 그대로다 → 다시 찍어도 같은 답이 나온다.
// ⚠️ 초록을 헐하게 주는 것이 아니다: 일곱 중 한 글자만 달라도 해시가 달라져 **통째로 다시 돈다**.
//    지난번 통과 자취는 .tmp/ 라 저장소에 없다 — 새로 받은 자리는 늘 통째로 돈다.
//    손으로 통째로 돌리려면 CHECK_MOCKUP_FULL=1 (브라우저를 갈아 끼웠을 때).
const INPUTS = ["docs/목업/클로이영어-화면-목업.html", "app/globals.css", "docs/목업/chrome.css",
                "scripts/check-mockup.mjs", "scripts/_mockup-page.mjs", "scripts/_css.mjs", "scripts/_browser.mjs"];
const STAMP = path.join(ROOT, ".tmp/check-mockup.pass");
const key = INPUTS.reduce((h, f) => h.update(f).update(fs.readFileSync(path.join(ROOT, f))), crypto.createHash("sha256")).digest("hex");
if (!process.env.CHECK_MOCKUP_FULL && fs.existsSync(STAMP)) {
  const [k, ...msg] = fs.readFileSync(STAMP, "utf8").split("\n");
  if (k === key) { console.log(msg.join("\n") + "  ⏭ 건너뜀 — 목업·CSS 가 지난번 통과 그대로 (통째로 돌리려면 CHECK_MOCKUP_FULL=1)"); process.exit(0); }
}

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
  for (const p of [p1, p2]) await p.addStyleTag({ content: ".shead{display:none!important} .rowbar,.sendbar{position:static!important}" });   // 붙는 줄(sticky)은 캡처 때 스크롤 위치에 따라 다른 자리에 붙어 헛잡힌다(2026-09-05 밤 #s1 폰 1.29%) — 화소 비교에서만 풀어 둔다. 붙나는 e2e/today 가 본다
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
if (bad.length) { fs.rmSync(STAMP, { force: true }); console.log("check-mockup ✗\n  " + bad.join("\n  ")); process.exit(1); }
const ok = `check-mockup ✓ 토큰 ${ntok} 같음 · 화면 ${nshot / VIEWS.length}장 × ${VIEWS.length}자리 화소 같음`;
fs.mkdirSync(path.dirname(STAMP), { recursive: true });   // 통과한 것만 자취를 남긴다 — 빨간 것은 위에서 지운다
fs.writeFileSync(STAMP, key + "\n" + ok);
console.log(ok);
