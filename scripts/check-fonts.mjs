/** 글꼴 검사 — 글자 있는 요소 전부의 **글꼴이 하나**(Noto Sans KR) · **크기가 열 단계 안** · **입력칸 = 본문**(PC 15 · 폰 16).
 *  체크박스·라디오는 글자가 없어 입력칸 비교에서 뺀다. 기본은 앱 CSS 로 그린 목업, CHECK_URLS 로 앱 화면도. */
import { launch, offline, VIEWS } from "./_browser.mjs";
import { build } from "./_mockup-page.mjs";
const SCALE = new Set([9, 11, 12, 13, 14, 15, 16, 17, 21, 28]);
const urls = process.env.CHECK_URLS ? process.env.CHECK_URLS.split(",") : [build().app];
const b = await launch(); let bad = 0;
for (const url of urls) for (const v of VIEWS) {
  const ctx = await b.newContext({ viewport: v.viewport, hasTouch: v.hasTouch, isMobile: v.isMobile }); await offline(ctx);
  const p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const roots = [...document.querySelectorAll("section.screen:not(#notes)")]; const R = roots.length ? roots : [document.body];
    const fam = {}, sizes = {}, inputs = {}, sample = {};
    const body = parseFloat(getComputedStyle(document.body).fontSize);
    const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    for (const el of document.querySelectorAll("*")) {
      if (!R.some(r => r.contains(el)) || el.closest(".shead,script,style,pre.mermaid,svg") || !hasText(el)) continue;
      const cs = getComputedStyle(el); if (cs.display === "none") continue;
      const f = cs.fontFamily.split(",")[0].replace(/"/g, "").trim(); fam[f] = (fam[f] || 0) + 1;
      const sz = parseFloat(cs.fontSize); sizes[sz] = (sizes[sz] || 0) + 1; sample[sz] = sample[sz] || el.tagName + "." + String(el.className).split(" ")[0];
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio)$/.test(el.type)) inputs[sz] = (inputs[sz] || 0) + 1;
    }
    return { body, fam, sizes, inputs, sample };
  });
  const fails = [];
  const fams = Object.keys(r.fam); if (fams.length !== 1) fails.push("글꼴이 하나가 아님: " + fams.map(f => `${f}×${r.fam[f]}`).join(" | "));
  const off = Object.keys(r.sizes).map(Number).filter(s => !SCALE.has(s)); if (off.length) fails.push("열 단계 밖: " + off.map(s => `${s}(${r.sample[s]})`).join(" "));
  const inOff = Object.keys(r.inputs).map(Number).filter(s => s !== r.body); if (inOff.length) fails.push(`입력칸 ≠ 본문(${r.body}): ${inOff.join(" ")}`);
  const tag = `${v.name}${urls.length > 1 ? " " + url : ""}`;
  if (fails.length) { bad++; console.log(`✗ ${tag}\n    ${fails.join("\n    ")}`); } else console.log(`✓ ${tag} — ${fams[0]} ${Object.values(r.fam)[0]}개 · 본문 ${r.body} · 입력칸 ${Object.keys(r.inputs).join(",") || "없음"}`);
  await ctx.close();
}
await b.close();
if (bad) { console.log(`check-fonts ✗ 어긋남 ${bad}`); process.exit(1); }
console.log("check-fonts ✓ 글꼴 1 · 크기 열 단계 안 · 입력칸 = 본문");
