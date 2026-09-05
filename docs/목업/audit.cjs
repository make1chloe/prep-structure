const { chromium } = require("playwright");
const GROUPS = {
  "칩(알약·태그)": ".tag,.pill,.nb-pill,.stag,.v,.auto,.unit,.ms,.ut,.sel,.tags>span,.tags>button",
  "단추 보통": ".btn:not(.sm)", "단추 작은": ".btn.sm",
  "세그먼트 보통": ".seg:not(.sm)>button", "세그먼트 작은": ".seg.sm>button", "○△✕": ".chk button,.tri button",
  "스테퍼": ".stepper", "입력칸": "input[type=text]:not(.stepper input):not(.scr)", "점수칸": "input.scr", "글상자": "textarea",
  "아이콘 자리": ".ln,.cemo,.k1 .ki,.cm,.nb-pi,.si,.ai,.hemo",
  "카드": ".card,.dcard,.task,.row,.lf,.k1,.ldn,.nb-card,.exr",
};
let bad = 0;
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  for (const vw of [1280, 390]) {
    const p = await b.newPage({ viewport: { width: vw, height: 900 } });
    await p.goto("file://" + process.cwd() + "/preview.html"); await p.waitForTimeout(300);
    const r = await p.evaluate((GROUPS) => {
      const out = {};
      for (const [name, sel] of Object.entries(GROUPS)) {
        const hs = {}, pads = {}, rad = {}, fs = {};
        for (const el of document.querySelectorAll("section.screen " + sel.split(",").join(",section.screen "))) {
          const rc = el.getBoundingClientRect(); if (!rc.width || !rc.height) continue; const cs = getComputedStyle(el);
          const h = Math.round(rc.height); hs[h] = (hs[h] || 0) + 1;
          const pd = cs.paddingTop + " " + cs.paddingRight; pads[pd] = (pads[pd] || 0) + 1;
          rad[cs.borderRadius] = (rad[cs.borderRadius] || 0) + 1; fs[cs.fontSize] = (fs[cs.fontSize] || 0) + 1;
        }
        const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`).join(" ");
        out[name] = { n: Object.values(hs).reduce((a, b) => a + b, 0), heights: top(hs), pad: top(pads), radius: top(rad), font: top(fs) };
      }
      // 넘침: 틀 밖으로 나간 요소
      const over = [];
      for (const f of document.querySelectorAll("section.screen .frame")) { const fr = f.getBoundingClientRect(); for (const el of f.querySelectorAll("*")) { const rc = el.getBoundingClientRect(); const inScroll = (()=>{ let e=el.parentElement; while(e && e!==f){ const o=getComputedStyle(e).overflowX; if(o==="auto"||o==="scroll") return true; e=e.parentElement;} return false; })(); if (!inScroll && rc.width && rc.right > fr.right + 1 && getComputedStyle(el).position !== "absolute") { over.push(`${(f.closest("section")||{}).id} ${el.tagName}.${String(el.className).split(" ")[0]} +${Math.round(rc.right - fr.right)}`); if (over.length > 12) break; } } if (over.length > 12) break; }
      // 글씨가 상자보다 큼(세로 넘침인데 overflow visible) · 형제 겹침 — 화면·기록 전부
      const tall = [], lap = [];
      const skip = el => el.closest("script,style,svg,pre.mermaid");
      const own = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      for (const el of document.querySelectorAll("body *")) {
        if (skip(el)) continue; const cs = getComputedStyle(el); if (cs.display === "none" || cs.display === "inline" || cs.display === "contents") continue;
        if (cs.overflowY === "visible" && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 3 && own(el)) { if (tall.length < 12) tall.push(`${(el.closest("section,.nsec")||{}).id||"?"} ${el.tagName}.${String(el.className).split(" ")[0]} ${el.clientHeight}<${el.scrollHeight}`); }
        const kids = [...el.children].filter(k => !skip(k) && getComputedStyle(k).display !== "inline" && getComputedStyle(k).display !== "none" && !/absolute|fixed/.test(getComputedStyle(k).position));
        for (let a = 0; a + 1 < kids.length; a++) { const r1 = kids[a].getBoundingClientRect(), r2 = kids[a + 1].getBoundingClientRect(); if (!r1.height || !r2.height) continue; const xo = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left); if (xo > 4 && r2.top < r1.bottom - 2 && r2.top > r1.top) { if (lap.length < 12) lap.push(`${(el.closest("section,.nsec")||{}).id||"?"} ${kids[a].tagName}.${String(kids[a].className).split(" ")[0]}→${kids[a+1].tagName}.${String(kids[a+1].className).split(" ")[0]} ${Math.round(r1.bottom - r2.top)}px`); } }
      }
      return { out, over, tall, lap };
    }, GROUPS);
    console.log(`\n===== ${vw}px =====`);
    for (const [k, v] of Object.entries(r.out)) console.log(`${k.padEnd(9)} n=${String(v.n).padStart(4)} | 높이 ${v.heights} | 안여백 ${v.pad} | 모서리 ${v.radius} | 글씨 ${v.font}`);
    console.log("넘침:", r.over.length ? r.over.join(" | ") : "0");
    console.log("글씨>상자:", r.tall.length ? r.tall.join(" | ") : "0");
    console.log("형제 겹침:", r.lap.length ? r.lap.join(" | ") : "0");
    for (const g of ["단추 보통", "단추 작은", "○△✕", "스테퍼", "입력칸", "점수칸"]) { const hs = r.out[g].heights.split(" ").filter(Boolean); if (hs.length > 1) { bad++; console.log(`✗ ${g} 높이가 둘 이상: ${r.out[g].heights}`); } }
    if (r.over.length || r.tall.length || r.lap.length) bad++;
    await p.close();
  }
  await b.close();
  console.log(bad ? `\n✗ 어긋남 ${bad}` : "\n✓ 높이 한 벌 · 넘침 0 · 겹침 0");
  process.exit(bad ? 1 : 0);
})();
