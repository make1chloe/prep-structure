const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  for (const scheme of ["light","dark"]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    await p.goto("file://" + process.cwd() + "/preview.html"); await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const parse = c => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1],+m[2],+m[3], m[4]===undefined?1:+m[4]] : null; };
      const lum = ([r,g,b]) => { const f = v => { v/=255; return v<=.03928? v/12.92 : ((v+.055)/1.055)**2.4; }; return .2126*f(r)+.7152*f(g)+.0722*f(b); };
      const bgOf = el => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.9) return c; e = e.parentElement; } return [255,255,255,1]; };
      const out = []; const seen = new Map();
      for (const el of document.querySelectorAll("body *")) {
        const txt = [...el.childNodes].filter(n => n.nodeType===3).map(n=>n.textContent.trim()).join("").trim(); if (!txt) continue;
        const cs = getComputedStyle(el); if (cs.visibility==="hidden"||cs.display==="none") continue; const rc = el.getBoundingClientRect(); if (!rc.width) continue;
        const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el);
        const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
        const size = parseFloat(cs.fontSize); const key = el.tagName + "." + String(el.className).split(" ").slice(0,2).join(".") + "|" + cs.color + "|" + bg.join(",");
        if (ratio < (size >= 18 ? 3 : 4.5) && !seen.has(key)) { seen.set(key, 1); out.push({ k: key, ratio: +ratio.toFixed(2), size, sec: (el.closest("section")||{}).id, txt: txt.slice(0,30) }); }
      }
      return out.sort((a,b)=>a.ratio-b.ratio);
    });
    console.log(`=== ${scheme}: ${r.length} unique low-contrast text styles ===`);
    for (const x of r.slice(0, 40)) console.log(`${x.ratio}  ${x.sec}  ${x.k}  '${x.txt}'`);
    for (const [name, sel] of [["01top", '#s1 .lf.warn >> nth=0'], ["01row", '#s1 .row[data-open="1"] .rowtop'], ["17", '#s17 .frame'], ["05", '#s6 .frame'], ["skins", '.skins >> nth=0'], ["06", '#s6b .frame']]) {
      try { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.screenshot({ path: `shot5-${scheme}-${name}.png` }); } catch (e) { console.log("FAIL", scheme, name, e.message.split("\n")[0]); } }
    await p.close();
  }
  await b.close();
})();
