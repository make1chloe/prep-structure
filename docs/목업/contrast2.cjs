const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("file://" + process.cwd() + "/preview.html"); await p.waitForTimeout(300);
  for (const skin of ["ink","warm","paper","bright"]) {
    const r = await p.evaluate((skin) => {
      document.documentElement.setAttribute("data-skin", skin);
      const parse = c => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1],+m[2],+m[3], m[4]===undefined?1:+m[4]] : null; };
      const lum = ([r,g,b]) => { const f = v => { v/=255; return v<=.03928? v/12.92 : ((v+.055)/1.055)**2.4; }; return .2126*f(r)+.7152*f(g)+.0722*f(b); };
      const bgOf = el => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.9) return c; e = e.parentElement; } return [255,255,255,1]; };
      const out=[]; const seen=new Set(); let n=0;
      for (const el of document.querySelectorAll("section.screen *")) {
        const txt=[...el.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent.trim()).join("").trim(); if(!txt) continue;
        const cs=getComputedStyle(el); if(cs.display==="none") continue; const rc=el.getBoundingClientRect(); if(!rc.width) continue;
        const fg=parse(cs.color); if(!fg||fg[3]<0.5) continue; const bg=bgOf(el); const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05); n++;
        const key=el.tagName+"."+String(el.className).split(" ").slice(0,2).join(".")+"|"+cs.color+"|"+bg.join(",");
        if(ratio<3.5 && !seen.has(key)){ seen.add(key); out.push(`${ratio.toFixed(2)} ${(el.closest("section")||{}).id} ${key} '${txt.slice(0,24)}'`); }
      }
      const warm=[]; const seen2=new Set();
      for (const el of document.querySelectorAll("section.screen *")) { const cs=getComputedStyle(el); for (const prop of ["backgroundColor","color","borderLeftColor"]) { const c=parse(cs[prop]); if(!c||c[3]<0.9) continue; const [r,g,b]=c.map(v=>v/255); const mx=Math.max(r,g,b),mn=Math.min(r,g,b); if(mx===mn) continue; const d=mx-mn; let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4; h*=60; if(h<0)h+=360; const l=(mx+mn)/2; const sat=d/(1-Math.abs(2*l-1)); if(h>=20&&h<=75&&l<0.5&&sat>0.35&&l>0.18){ const k=prop+cs[prop]; if(!seen2.has(k)){seen2.add(k); warm.push(`${prop} ${cs[prop]} @${(el.closest("section")||{}).id} ${el.tagName}.${String(el.className).split(" ")[0]}`);} } } }
      return { checked:n, low:out.slice(0,8), warm:warm.slice(0,8) };
    }, skin);
    console.log(`=== ${skin}: 글씨 ${r.checked}개 · 3.5 미만 ${r.low.length} · 갈색 ${r.warm.length}`); for (const x of [...r.low, ...r.warm]) console.log("   ", x);
  }
  await b.close();
})();
