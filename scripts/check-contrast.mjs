/** 대비 검사 — 화면의 **글씨 전부**를 진짜 브라우저에서 재서 바탕과의 대비를 본다(디자인-5).
 *  배색 다섯 벌 × 밝음·어두움 = 열 자리. 글씨 3.5 아래면 실패(4.5 아래는 보조 글씨로 세어 보고만), 갈색(확정-㊽)이 그려지면 실패.
 *  기본은 앱 CSS 로 그린 목업, CHECK_URLS 로 앱 화면도. */
import { launch, offline } from "./_browser.mjs";
import { build } from "./_mockup-page.mjs";
const SKINS = ["", "paper", "bright", "ink", "warm"];
const urls = process.env.CHECK_URLS ? process.env.CHECK_URLS.split(",") : [build().app];
const b = await launch(); let bad = 0;
for (const url of urls) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); await offline(p.context()); await p.goto(url); await p.waitForTimeout(300);
  for (const scheme of ["light", "dark"]) for (const skin of SKINS) {
    await p.emulateMedia({ colorScheme: scheme });
    const r = await p.evaluate((skin) => {
      if (skin) document.documentElement.setAttribute("data-skin", skin); else document.documentElement.removeAttribute("data-skin");
      const parse = c => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
      const bgOf = el => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.9) return c; e = e.parentElement; } return parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]; };
      const roots = [...document.querySelectorAll("section.screen:not(#notes)")]; const R = roots.length ? roots : [document.body];
      const low = [], soft = new Set(), brown = [], seen = new Set(); let n = 0;
      for (const el of document.querySelectorAll("*")) {
        if (!R.some(r => r.contains(el)) || el.closest(".shead,script,style,svg")) continue;
        const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
        for (const prop of ["backgroundColor", "color", "borderLeftColor"]) { const c = parse(cs[prop]); if (!c || c[3] < .9) continue; const [r, g, bb] = c.map(v => v / 255); const mx = Math.max(r, g, bb), mn = Math.min(r, g, bb); if (mx === mn) continue; const d = mx - mn; let h = mx === r ? ((g - bb) / d) % 6 : mx === g ? (bb - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; const l = (mx + mn) / 2, s = d / (1 - Math.abs(2 * l - 1)); if (h >= 20 && h <= 75 && l > .18 && l < .5 && s > .35) { const k = prop + cs[prop]; if (!seen.has(k)) { seen.add(k); brown.push(`${prop} ${cs[prop]} ${el.tagName}.${String(el.className).split(" ")[0]}`); } } }
        const txt = [...el.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent.trim()).join("").trim(); if (!txt) continue;
        const rc = el.getBoundingClientRect(); if (!rc.width) continue; const fg = parse(cs.color); if (!fg || fg[3] < .5) continue;
        const bg = bgOf(el); const ratio = (Math.max(lum(fg), lum(bg)) + .05) / (Math.min(lum(fg), lum(bg)) + .05); n++;
        const min = parseFloat(cs.fontSize) >= 18 ? 3 : 4.5; const key = el.tagName + "." + String(el.className).split(" ").slice(0, 2).join(".") + "|" + cs.color + "|" + bg.join(",");
        if (ratio < 3.5 && !seen.has(key)) { seen.add(key); low.push(`${ratio.toFixed(2)} ${(el.closest("section") || {}).id || ""} ${key.split("|")[0]} '${txt.slice(0, 20)}'`); }
        else if (ratio < min) soft.add(key.split("|")[0]);
      }
      return { n, low: low.slice(0, 10), soft: soft.size, brown: brown.slice(0, 6) };
    }, skin);
    const tag = `${skin || "기본"}·${scheme === "dark" ? "어두움" : "밝음"}`;
    if (r.low.length || r.brown.length) { bad++; console.log(`✗ ${tag} 글씨 ${r.n} · 3.5 아래 ${r.low.length} · 갈색 ${r.brown.length}\n    ${[...r.low, ...r.brown].join("\n    ")}`); }
    else console.log(`✓ ${tag} 글씨 ${r.n} · 3.5 아래 0 · 보조(3.5~4.5) ${r.soft} · 갈색 0`);
  }
  await p.close();
}
await b.close();
if (bad) { console.log(`check-contrast ✗ 어긋남 ${bad}`); process.exit(1); }
console.log("check-contrast ✓ 열 자리 모두 글씨 3.5 이상 · 갈색 0");
