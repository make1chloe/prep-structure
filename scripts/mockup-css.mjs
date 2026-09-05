/** 목업 CSS 를 앱 CSS 로 — 한 벌에서 두 파일을 만든다.
 *
 *  목업이 곧 명세다(구현 프롬프트). 그래서 앱의 겉(app/globals.css)은 손으로 다시 쓰지 않고
 *  목업 <style> 에서 **기계로 갈라낸다**:
 *    · 화면 안(.frame)·배색 고르기·html/body/토큰 에 닿는 규칙 → app/globals.css
 *    · 목업의 겉껍질(메뉴·화면 머리·기록 페이지·9/5 딱지)에만 닿는 규칙 → docs/목업/chrome.css
 *  어느 쪽인지는 짐작하지 않고 **브라우저에 물어** 정한다(그 셀렉터가 화면 안 요소에 닿나).
 *  주석은 다음 규칙을 따라간다 — 목업의 「왜」가 앱 CSS 에도 남는다.
 *
 *  다시 만들려면: node scripts/mockup-css.mjs   (목업을 고친 날 반드시. check-mockup 이 어긋남을 잡는다) */
import fs from "node:fs";
import path from "node:path";
import { launch } from "./_browser.mjs";
import { ROOT, MOCKUP, styleOf, build } from "./_mockup-page.mjs";

import { parse } from "./_css.mjs";
const strip = s => s.replace(/::?(hover|focus-visible|focus-within|focus|active|visited|disabled|checked|placeholder|before|after|first-letter|first-line|selection|-webkit-[a-z-]+|-moz-[a-z-]+)(\([^)]*\))?/g, "");
const FORCE_APP = s => /^(:root|html|body|\*)(?![\w-])/.test(s) || /\[data-(skin|theme)/.test(s) || /^(button|input|textarea|select|code|kbd|h[1-6]|a|p|small|table|th|td|tr|ul|ol|li|label|i|b|em|strong)(?![\w-])/.test(s.split(",")[0].trim());
// 목업 설명·물음·기록·머리줄 부품은 앱에 안 들어간다 — 화면 안에 있어도 겉껍질
const FORCE_CHROME = s => /\.(fx|look|ask|opts|opt|rules|nsec|nh|ng|nb|notewrap|ph1|eyebrow|lede|shead|snum|stag|wrap)(?![\w-])|^(nav|main|header\.top|section\.screen)(?![\w-])/.test(s);

// ── 2. 브라우저에 묻는다 ──
async function classify(selectors) {
  const { orig } = build();
  const b = await launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(orig); await p.waitForTimeout(200);
  const r = await p.evaluate((sels) => {
    // 앱 자리 = 화면 section 안(머리줄 .shead 빼고) · 배색 고르기(.skins) · html/body. 기록 페이지(#notes)와 메뉴·머리는 겉껍질
    const inApp = el => el === document.documentElement || el === document.body || !!el.closest(".skins") || (!!el.closest("section.screen:not(#notes)") && !el.closest(".shead"));
    const inCls = new Set(), outCls = new Set();
    for (const el of document.querySelectorAll("*")) for (const c of el.classList) (inApp(el) ? inCls : outCls).add(c);
    const out = {};
    for (const s of sels) {
      let els; try { els = document.querySelectorAll(s); } catch { out[s] = null; continue; }
      let i = 0, o = 0; for (const el of els) inApp(el) ? i++ : o++;
      out[s] = { i, o };
    }
    return { out, inCls: [...inCls], outCls: [...outCls] };
  }, selectors);
  await b.close(); return r;
}

// ── 3. 가른다 ──
const css = styleOf(fs.readFileSync(MOCKUP, "utf8"));
const tree = parse(css);
const rules = []; (function walk(items) { for (const it of items) it.type === "rule" ? rules.push(it) : it.type === "at" && walk(it.children); })(tree);
const parts = s => s.split(/,(?![^(]*\))/).map(x => x.trim()).filter(Boolean);
const stripped = rules.flatMap(r => parts(r.selector).map(strip));
const { out, inCls, outCls } = await classify([...new Set(stripped)]);
const inSet = new Set(inCls), outOnly = new Set(outCls.filter(c => !inSet.has(c)));
let nApp = 0, nChrome = 0, nGuess = 0; const chromeList = [];
const guessed = [];
for (const r of rules) {
  const ps = parts(r.selector);
  const verdicts = ps.map(pt => {
    if (FORCE_CHROME(pt)) return "chrome"; if (FORCE_APP(pt)) return "app";
    const m = out[strip(pt)]; if (m && m.i > 0) return "app"; if (m && m.o > 0) return "chrome"; return null;
  });
  let dest;
  if (verdicts.includes("app")) dest = "app";
  else if (verdicts.length && verdicts.every(v => v === "chrome")) dest = "chrome";
  else { // 아무 데도 안 닿는 조각만 남은 규칙(상태·죽은 것) — 클래스가 전부 겉껍질에만 있는 이름이면 겉껍질
    const cls = [...r.selector.matchAll(/\.([\w-]+)/g)].map(x => x[1]);
    dest = cls.length && cls.every(c => outOnly.has(c)) ? "chrome" : "app"; nGuess++; guessed.push(r.selector.slice(0, 50) + "→" + dest);
  }
  r.dest = dest; dest === "app" ? nApp++ : (nChrome++, chromeList.push(r.selector.slice(0, 60)));
}

// ── 4. 두 파일로 낸다 — 주석은 다음 규칙을 따라간다, @media 는 양쪽에 필요한 만큼만 ──
function emit(items, dest, depth = 0) {
  let outStr = "", pending = "";
  const ind = "  ".repeat(depth);
  for (const it of items) {
    if (it.type === "comment") { pending += ind + it.raw + "\n"; continue; }
    if (it.type === "rule") { if (it.dest === dest) { outStr += pending + ind + it.raw + "\n"; } pending = ""; continue; }
    const inner = emit(it.children, dest, depth + 1);
    if (inner.trim()) outStr += pending + ind + it.head + "{\n" + inner + ind + "}\n";
    pending = "";
  }
  return outStr;
}
const stamp = new Date().toISOString().slice(0, 10);
const headApp = `/* ══════════════════════════════════════════════════════════════════════
 * 클로이영어 새 앱 — 겉 한 벌. **손으로 고치지 않는다.**
 * 목업(docs/목업/클로이영어-화면-목업.html)의 <style> 에서 node scripts/mockup-css.mjs 가 갈라냈다(${stamp}).
 * 겉을 바꾸려면 목업을 고치고 다시 만든다 — 목업이 곧 명세다. check-mockup 이 둘이 같은지 잰다.
 * 까닭·규칙은 docs/디자인-기본.md(배색 다섯 벌 · 치수 한 벌 · 글꼴 한 벌 · 금지 9).
 * ══════════════════════════════════════════════════════════════════════ */\n`;
const headChrome = `/* 목업의 겉껍질(메뉴 · 화면 머리 · 기록 페이지 · 9/5 딱지)에만 닿는 규칙 — 앱에는 안 들어간다.
 * node scripts/mockup-css.mjs 가 만든다(${stamp}). 검사가 목업을 앱 CSS 로 그릴 때 이것을 함께 씌운다. */\n`;
fs.writeFileSync(path.join(ROOT, "app/globals.css"), headApp + emit(tree, "app"));
fs.writeFileSync(path.join(ROOT, "docs/목업/chrome.css"), headChrome + emit(tree, "chrome"));
console.log(`규칙 ${rules.length} → 앱 ${nApp} · 겉껍질 ${nChrome} (아무 데도 안 닿아 이름으로 정한 것 ${nGuess})`);
console.log("겉껍질로 간 셀렉터:", chromeList.join(" | "));
console.log("이름으로 정한 것:", guessed.join(" | "));
