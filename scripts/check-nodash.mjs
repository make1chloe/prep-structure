/** 실제 화면에 「—」가 없다(대전제-18 · (어22)) — 글자 마디·placeholder·aria-label·title 을 훑는다. 씨앗 이름(zz_)은 뺀다.
 *  check-sizes 처럼 CHECK_URLS · CHECK_STATE 로 역할마다 돈다(run.sh). 코드는 check-plain 이 재고, 여기는 DB 에서 온 글까지 본다(발송 10 치환 표 · 루틴 11 항목 설명이 새고 있었다). */
import { launch, offline, stateOpts } from "./_browser.mjs";
const urls = (process.env.CHECK_URLS ?? "").split(",").filter(Boolean);
if (!urls.length) { console.log("check-nodash · CHECK_URLS 없음 — 건너뜀"); process.exit(0); }
const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, ...stateOpts() }); await offline(ctx); const p = await ctx.newPage();
const found = [];
for (const u of urls) {
  await p.goto(u, { waitUntil: "domcontentloaded" }).catch(() => {}); await p.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {}); await p.waitForTimeout(150);
  const hits = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const tag = n.parentElement?.tagName; if (tag === "SCRIPT" || tag === "STYLE") continue; const t = n.nodeValue; if (t && t.includes("—")) out.push(t.replace(/\s+/g, " ").trim().slice(0, 80)); }
    for (const el of document.querySelectorAll("[placeholder],[aria-label],[title]")) for (const a of ["placeholder", "aria-label", "title"]) { const v = el.getAttribute(a); if (v && v.includes("—")) out.push(`${a}=${v.slice(0, 70)}`); }
    return out; });
  for (const h of hits) if (!/zz_/.test(h)) found.push(`${new URL(u).pathname} · ${h}`);
}
await b.close();
if (found.length) { console.log(`❌ check-nodash · 화면에 「—」 ${found.length}곳`); for (const f of found.slice(0, 12)) console.log("   ", f); process.exit(1); }
console.log(`check-nodash ✓ 화면 ${urls.length}장에 「—」 0`);
