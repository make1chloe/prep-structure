/** 치수 검사 — 화면의 부품을 종류별로 재서 **높이가 하나**인지(지침 8절 치수 한 벌) · 틀 밖 넘침 0 · 글씨>상자 0 · 형제 겹침 0 · 가로 잘림 0(overflow hidden 안에서 글씨가 상자보다 넓은 것 — 회차 세그먼트가 잘렸는데 초록이던 2026-09-05).
 *  PC 1280 · 폰 390(손가락) 둘 다. 기본은 앱 CSS 로 그린 목업(.tmp/mockup-app.html) — 앱 화면이 생기면 CHECK_URLS 로 그 주소도 본다.
 *  검사 결과는 사람이 거르지 않는다 — 어긋나면 종료 코드 1 (목업 ㊲ 교훈). */
import { launch, offline, stateOpts, VIEWS } from "./_browser.mjs";
import { build } from "./_mockup-page.mjs";
const GROUPS = {
  "칩(알약·태그)": ".tag,.pill,.nb-pill,.stag,.v,.auto,.unit,.ms,.ut,.sel,.tags>span,.tags>button",
  "단추 보통": ".btn:not(.sm)", "단추 작은": ".btn.sm",
  "세그먼트 보통": ".seg:not(.sm)>button", "세그먼트 작은": ".seg.sm>button", "○△✕": ".chk button,.tri button",
  "스테퍼": ".stepper", "입력칸": "input[type=text]:not(.stepper input):not(.scr)", "점수칸": "input.scr", "글상자": "textarea",
  "아이콘 자리": ".ln,.cemo,.k1 .ki,.cm,.nb-pi,.si,.ai,.hemo",
};
const ONE = ["단추 보통", "단추 작은", "○△✕", "스테퍼", "입력칸", "점수칸"];   // 높이가 반드시 하나
const urls = process.env.CHECK_URLS ? process.env.CHECK_URLS.split(",") : [build().app];
const b = await launch(); let bad = 0;
for (const url of urls) for (const v of VIEWS) {
  const ctx = await b.newContext({ viewport: v.viewport, hasTouch: v.hasTouch, isMobile: v.isMobile, ...stateOpts() }); await offline(ctx);
  const p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(300);
  const r = await p.evaluate((GROUPS) => {
    const roots = [...document.querySelectorAll("section.screen:not(#notes)")]; const R = roots.length ? roots : [document.body];
    const inRoot = el => R.some(r => r.contains(el)) && !el.closest(".shead");
    const out = {};
    for (const [name, sel] of Object.entries(GROUPS)) {
      const hs = {};
      for (const el of document.querySelectorAll(sel)) { if (!inRoot(el)) continue; const rc = el.getBoundingClientRect(); if (!rc.width || !rc.height) continue; const cs = getComputedStyle(el); if (cs.display === "none") continue; const h = Math.round(rc.height); hs[h] = (hs[h] || 0) + 1; }
      out[name] = Object.entries(hs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`);
    }
    const over = [], tall = [], lap = [], clip = [], vert = [];
    const skip = el => el.closest("script,style,svg,pre.mermaid,.shead");
    const frames = [...document.querySelectorAll("section.screen .frame")]; const F = frames.length ? frames : [document.body];
    for (const f of F) { const fr = f.getBoundingClientRect(); for (const el of f.querySelectorAll("*")) { const rc = el.getBoundingClientRect(); let e = el.parentElement, sc = false; while (e && e !== f) { const o = getComputedStyle(e).overflowX; if (o === "auto" || o === "scroll") { sc = true; break; } e = e.parentElement; } if (!sc && rc.width && rc.right > fr.right + 1 && getComputedStyle(el).position !== "absolute") { over.push(`${(f.closest("section") || {}).id || ""} ${el.tagName}.${String(el.className).split(" ")[0]} +${Math.round(rc.right - fr.right)}`); if (over.length > 12) break; } } }
    const own = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    for (const el of document.querySelectorAll("*")) {
      if (skip(el) || !inRoot(el)) continue; const cs = getComputedStyle(el); if (cs.display === "none" || cs.display === "inline" || cs.display === "contents") continue;
      // 잘림 — ① 세그먼트가 제 칸보다 넓다(overflow hidden 이라 잘려도 조용하다) ② 단추 글씨가 단추보다 넓거나 높다(flex 로 눌린 단추는 scrollWidth 가 안 늘어 못 잡았다 — 2026-09-05 회차 세그먼트). 입력칸 값이 흐르는 것은 정상이라 안 본다
      if (el.classList.contains("seg") && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 3 && clip.length < 12) clip.push(`${(el.closest("section") || {}).id || ""} ${el.tagName}.${String(el.className).split(" ")[0]} ${el.clientWidth}<${el.scrollWidth}`);
      if (el.tagName === "BUTTON" && own(el) && el.clientWidth > 0 && clip.length < 12) { const rg = document.createRange(); rg.selectNodeContents(el); const tb = rg.getBoundingClientRect(); const eb = el.getBoundingClientRect(); if (tb.width > eb.width + 2 || tb.height > eb.height + 2) clip.push(`${(el.closest("section") || {}).id || ""} BUTTON.${String(el.className).split(" ")[0]} 「${el.textContent.trim().slice(0, 16)}」 글씨 ${Math.round(tb.width)}×${Math.round(tb.height)} > 상자 ${Math.round(eb.width)}×${Math.round(eb.height)}`); }
      // 세로 글자(검사-㉓) — 자식 없는 글자 상자의 띄어쓰기 없는 짧은 낱말(2~8자)이 두 줄 이상으로 꺾였다(「상황」이 상/황). 줄 조각(getClientRects)으로 센다 — 상자 높이는 단추 여백에 속는다. 일부러 세운 글(writing-mode)과 표 칸(td·th — 칸 안에서 접히는 것은 표의 일)은 뺀다
      if (own(el) && el.children.length === 0 && !/^(TD|TH)$/.test(el.tagName) && cs.writingMode === "horizontal-tb" && vert.length < 12) { const t = el.textContent.trim(); if (t && !/\s/.test(t) && [...t].length >= 2 && [...t].length <= 8) { const rg = document.createRange(); rg.selectNodeContents(el); const ln = [...rg.getClientRects()].filter(r => r.width > 0 && r.height > 0); if (ln.length > 1 && Math.abs(ln[0].top - ln[ln.length - 1].top) > 4) vert.push(`${(el.closest("section") || {}).id || ""} ${el.tagName}.${String(el.className).split(" ")[0]} 「${t}」 ${ln.length}줄`); } }
      if (cs.overflowY === "visible" && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 3 && own(el) && tall.length < 12) tall.push(`${(el.closest("section") || {}).id || ""} ${el.tagName}.${String(el.className).split(" ")[0]} ${el.clientHeight}<${el.scrollHeight}`);
      const kids = [...el.children].filter(k => !skip(k) && !/^(inline|none)$/.test(getComputedStyle(k).display) && !/absolute|fixed/.test(getComputedStyle(k).position));
      for (let i = 0; i + 1 < kids.length; i++) { const r1 = kids[i].getBoundingClientRect(), r2 = kids[i + 1].getBoundingClientRect(); if (!r1.height || !r2.height) continue; const xo = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left); if (xo > 4 && r2.top < r1.bottom - 2 && r2.top > r1.top && lap.length < 12) lap.push(`${(el.closest("section") || {}).id || ""} ${kids[i].tagName}.${String(kids[i].className).split(" ")[0]}→${kids[i + 1].tagName}.${String(kids[i + 1].className).split(" ")[0]} ${Math.round(r1.bottom - r2.top)}px`); }
    }
    return { out, over, tall, lap, clip, vert };
  }, GROUPS);
  const fails = [];
  for (const g of ONE) if ((r.out[g] || []).length > 1) fails.push(`${g} 높이가 둘 이상: ${r.out[g].join(" ")}`);
  if (r.over.length) fails.push("넘침: " + r.over.join(" | ")); if (r.tall.length) fails.push("글씨>상자: " + r.tall.join(" | ")); if (r.lap.length) fails.push("형제 겹침: " + r.lap.join(" | ")); if (r.clip.length) fails.push("잘림(세그먼트가 칸보다 넓다 · 단추 글씨가 단추보다 크다): " + r.clip.join(" | ")); if (r.vert.length) fails.push("세로 글자: " + r.vert.join(" | "));
  const tag = `${v.name}${urls.length > 1 ? " " + url : ""}`;
  if (fails.length) { bad++; console.log(`✗ ${tag}\n    ${fails.join("\n    ")}`); } else console.log(`✓ ${tag} — ${ONE.map(g => `${g} ${r.out[g]?.[0] ?? "없음"}`).join(" · ")} · 넘침 0 · 겹침 0`);
  await ctx.close();
}
await b.close();
if (bad) { console.log(`check-sizes ✗ 어긋남 ${bad}`); process.exit(1); }
console.log("check-sizes ✓ 높이 한 벌 · 넘침 0 · 글씨>상자 0 · 겹침 0 · 세로 글자 0");
