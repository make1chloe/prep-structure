// 글꼴 한 벌 검사 (체크박스·라디오는 글자가 없어 입력칸 크기 비교에서 뺀다) — 글꼴 1 · 글씨 크기 열 단계 밖 0 · 입력칸 = 본문 (PC 1280 손가락 아님 · 폰 390 손가락)
const { chromium } = require("playwright");
const SCALE = new Set([9, 11, 12, 13, 14, 15, 16, 17, 21, 28]);
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  let bad = 0;
  for (const [vw, touch] of [[1280, false], [390, true]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: 900 }, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    await p.goto("file://" + process.cwd() + "/preview.html"); await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const fam = {}, sizes = {}, inputs = {}, samples = {}, fsam = {};
      const body = parseFloat(getComputedStyle(document.body).fontSize);
      const coarse = matchMedia("(pointer:coarse)").matches;
      const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      for (const el of document.querySelectorAll("body *")) {
        if (!hasText(el)) continue; if (el.closest("script,style,pre.mermaid")) continue;
        const cs = getComputedStyle(el); if (cs.display === "none") continue;
        const f = cs.fontFamily.split(",")[0].replace(/"/g, "").trim(); fam[f] = (fam[f] || 0) + 1; (fsam[f] = fsam[f] || []).length < 4 && fsam[f].push(el.tagName + "." + String(el.className).split(" ")[0]);
        const sz = parseFloat(cs.fontSize); sizes[sz] = (sizes[sz] || 0) + 1;
        if (!samples[sz]) samples[sz] = el.tagName + "." + String(el.className).split(" ")[0];
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio)$/.test(el.type)) inputs[sz] = (inputs[sz] || 0) + 1;
      }
      return { body, coarse, fam, sizes, inputs, samples, fsam };
    });
    const off = Object.keys(r.sizes).map(Number).filter(v => !SCALE.has(v));
    const inOff = Object.keys(r.inputs).map(Number).filter(v => v !== r.body);
    const fams = Object.keys(r.fam);
    console.log(`\n===== ${vw}px 손가락=${r.coarse} 본문 ${r.body}px =====`);
    console.log("글꼴:", fams.map(f => `${f}×${r.fam[f]}${r.fam[f] < 100 ? " (" + r.fsam[f].join(" ") + ")" : ""}`).join(" | "));
    console.log("크기:", Object.entries(r.sizes).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}×${v}`).join(" "));
    console.log("입력칸:", Object.entries(r.inputs).map(([k, v]) => `${k}×${v}`).join(" "));
    if (fams.length !== 1) { bad++; console.log("✗ 글꼴이 둘 이상"); }
    if (off.length) { bad++; console.log("✗ 열 단계 밖:", off.map(v => `${v}(${r.samples[v]})`).join(" ")); }
    if (inOff.length) { bad++; console.log("✗ 입력칸 ≠ 본문:", inOff.join(" ")); }
    await ctx.close();
  }
  await b.close();
  console.log(bad ? `\n✗ 어긋남 ${bad}` : "\n✓ 글꼴 1 · 크기 열 단계 안 · 입력칸 = 본문");
  process.exit(bad ? 1 : 0);
})();
