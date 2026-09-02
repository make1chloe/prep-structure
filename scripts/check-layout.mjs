/**
 * 배색·레이아웃 검사 — `app/globals.css` 가 폰에서 버티는지 **진짜 브라우저로** 확인한다.
 *
 * 왜 이 검사가 있나
 *   원장님이 사진 셋으로 잡아 주시기 전까지 아무도 몰랐다 (계획 ㉜).
 *   그리고 첫 검사는 부실해서 **오탐 47건 · 진짜 15건 놓침**이 났다.
 *   그래서 여기서는 세 가지를 지킨다.
 *     1. **진짜 브라우저**에 320·390·768·1400 폭으로 그려 보고 잰다 (글자로 훑지 않는다).
 *     2. **일부러 어기는 본보기**(`scripts/_layout-fixture.html`)를 같이 열어서
 *        검사가 그것을 **잡는지까지** 확인한다. 못 잡으면 검사가 실패한다.
 *     3. 화면에 실제로 들어갈 **진짜 긴 글자**를 DB 에서 읽어 와 그것으로 그린다 —
 *        「Lorem ipsum」으로는 안 깨지고 진짜 단원 이름(93자)으로는 깨진다.
 *
 * ⚠️ 브라우저가 없으면 **얕은 검사(글자 훑기)만** 돌고, 출력에 그렇게 **밝힌다.**
 *    「있는 척」이 제일 나쁘다 — 초록인데 화면은 깨져 있게 된다.
 *
 * 돌리는 법:  node scripts/check-layout.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

const CSS_PATH = "app/globals.css";
const LAYOUT_PATH = "app/layout.js";
const FIXTURE = "scripts/_layout-fixture.html";
const WIDTHS = [320, 390, 768, 1400];          // 계획 ㉜ 의 네 폭 그대로
const COARSE = new Set([320, 390, 768]);       // ⚠️ 아이패드(768)도 **손가락 기계**다 (오류 104)
/** ⚠️ 브라우저 없이 초록을 보고 싶으면 **사람이 일부러** 이걸 켜야 한다.
 *    거짓 초록은 검사가 없는 것보다 나쁘다 — 지난 판에서 크게 다친 자리다. */
const ALLOW_SHALLOW = process.env.ALLOW_SHALLOW === "1";

let fail = 0, n = 0;
const ok = (t, cond, why = "") => {
  n++;
  if (cond) console.log(`   ✅ ${t}`);
  else { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
};

/* ══════════════════════════════════════════════════════════════════════
 * 1부 — 글자로 훑는 검사 (CSS 원본)
 *
 * ⚠️ 계획의 경고: 「글자로 훑는 검사는 헛짚고 헛통과한다」.
 *    그래서 ① 주석을 **먼저 지우고** ② 낱말의 앞뒤를 정확히 물고
 *    ③ 같은 조건 블록이 여럿이면 합집합으로 본다.
 * ══════════════════════════════════════════════════════════════════════ */

/** 주석을 지운다 — 줄 번호가 안 밀리게 개행은 남긴다 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** 이름 대장 — 주석 **안**에 있으므로 지우기 전에 뽑는다 */
function readRegistry(src) {
  const names = [], dup = [];
  for (const m of src.matchAll(/@이름\s+\.([A-Za-z][A-Za-z0-9_-]*)\s+(\S.*)$/gm)) {
    if (names.includes(m[1])) dup.push(m[1]);
    names.push(m[1]);
  }
  return { names, dup };
}

/** 중괄호를 세어 규칙을 뜯는다. `@media` 안은 안으로 들어간다 */
function parseRules(src, media = "") {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const prelude = src.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < src.length && depth > 0) { const c = src[j]; if (c === "{") depth++; else if (c === "}") depth--; j++; }
    const body = src.slice(open + 1, j - 1);
    if (prelude.startsWith("@")) {
      if (/^@(media|supports|container)\b/.test(prelude)) out.push(...parseRules(body, media ? `${media} ${prelude}` : prelude));
      // @keyframes · @font-face 는 선택자가 아니라 안 본다
    } else if (prelude) {
      out.push({ sel: prelude.replace(/\s+/g, " "), body, media });
    }
    i = j;
  }
  return out;
}

/** 한 규칙의 선언을 (속성, 값) 으로 — 괄호 안 세미콜론에 안 속는다 */
function decls(body) {
  const out = [];
  let buf = "", par = 0;
  for (const c of body) {
    if (c === "(") par++; else if (c === ")") par--;
    if (c === ";" && par === 0) { out.push(buf); buf = ""; } else buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out.map((d) => {
    const k = d.indexOf(":");
    return k < 0 ? null : { prop: d.slice(0, k).trim().toLowerCase(), val: d.slice(k + 1).trim() };
  }).filter(Boolean);
}

/** ⚠️ 속성 선택자와 따옴표 안을 **먼저 지운다.** 안 지우면 `a[href$=".pdf"]` 의 `.pdf` 를
 *    클래스로 읽어 「대장에 없는 클래스: .pdf」로 거짓 실패한다(실측). 그걸 통과시키려고
 *    대장에 `.pdf` 를 적으면 「한 이름은 한 뜻」이라는 대장 자체가 오염된다.
 *    `:not()`·`:where()` 안의 클래스는 **남겨야** 하므로 괄호는 안 건드린다. */
const stripAttrSel = (sel) => sel.replace(/\[[^\]]*\]/g, " ").replace(/"[^"]*"|'[^']*'/g, " ");
const classesIn = (sel) => [...stripAttrSel(sel).matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1]);

/** 줄임말을 풀어 준다 — ⚠️ `font: 700 12.5px/1.4 Menlo, monospace` 한 줄이
 *    C9(0.5px 단)·C10(한글에 고정폭)을 **동시에** 빠져나갔다(실측 「어긴 것 0건」).
 *    오류 106 과 107 을 한 줄에 같이 저지르면 검사가 통과시키던 통로다. */
function expandShorthand(d) {
  const out = [d];
  if (d.prop === "font" && !/^(caption|icon|menu|message-box|small-caption|status-bar|inherit|initial|unset)\b/.test(d.val.trim())) {
    // `[스타일 무게] 크기[/줄높이] 글꼴목록` — 크기와 글꼴목록만 떼어 낸다
    const m = /(^|\s)((?:[\d.]+(?:px|rem|em|%|pt)|xx?-(?:small|large)|small|medium|large|larger|smaller)(?:\s*\/\s*\S+)?)\s+(.+)$/.exec(d.val.trim());
    if (m) {
      out.push({ prop: "font-size", val: m[2].split("/")[0].trim() });
      out.push({ prop: "font-family", val: m[3].trim() });
    }
  }
  // `grid:`·`grid-auto-columns:` 도 맨 `fr` 을 담을 수 있다 — C4 가 보게 넘긴다
  if (/^(grid|grid-template|grid-auto-columns|grid-auto-rows)$/.test(d.prop))
    out.push({ prop: "grid-template-columns", val: d.val });
  return out;
}

/** `var(--x)` 를 실제 값으로 푼다 — ⚠️ C7 이 `var(--fs6)` 을 못 읽어서,
 *    C9 가 시키는 대로 **토큰으로 쓰는 순간 C7 이 눈을 감았다**(실측). 오류 104 의 통로.
 *    대비 검사도 이 표를 쓴다 (같은 표를 두 벌 만들지 않는다 — 원칙 1). */
function resolveVar(val, table) {
  let v = String(val);
  for (let i = 0; i < 6 && /var\(/.test(v); i++)
    v = v.replace(/var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,([^()]*))?\)/g, (m, name, dflt) =>
      table[name] != null ? table[name] : (dflt != null ? dflt.trim() : m));
  return v.trim();
}

/** 한 글자 이름과 한 낱말 상태 이름 — ⚠️ `.v` → `.q` → `.open` 으로 **세 번** 터졌다 */
const BAD_NAME = /^([a-z]|open|on|off|sel|active|done|new|hide|show|big|top|end|sm|md|lg)$/i;
const MONO_RE = /monospace|menlo|consolas|courier|sfmono|sf mono|ui-monospace|jetbrains|d2coding/i;
const INPUTISH = /(^|[\s,>])(input|select|textarea)\b|\.fld\b/i;

/** CSS 한 벌을 검사해 「어긴 것」 목록을 낸다. globals.css 는 0건이어야 하고, 본보기는 많이 나와야 한다 */
function auditCss(raw, { wantRegistry }) {
  const bad = [];               // {code, why}
  const add = (code, why) => bad.push({ code, why });
  const reg = readRegistry(raw);
  const src = stripComments(raw);
  const rules = parseRules(src);
  const all = rules.map((r) => ({ ...r, d: decls(r.body).flatMap(expandShorthand) }));

  /* 토큰 표 — `:root` 에 적힌 값. C7·C12·대비 검사가 **같은 표 하나**를 쓴다 */
  const TOK = {};
  for (const r of all) if (!r.media && /^:root/.test(r.sel)) for (const d of r.d) if (d.prop.startsWith("--")) TOK[d.prop] = d.val.trim();
  const px = (val) => { const m = /(-?[\d.]+)px/.exec(resolveVar(val, TOK)); return m ? Number(m[1]) : null; };

  /* C1 이름 대장 — 여기 없는 이름을 쓰면 그게 「같은 이름 두 뜻」이 들어오는 입구다 */
  if (wantRegistry) {
    if (!reg.names.length) add("C1", "이름 대장이 없다 (`@이름 .foo 뜻` 줄)");
    for (const d of reg.dup) add("C1", `이름 대장에 같은 이름이 두 번: .${d} — **두 뜻으로 쓰이고 있다**`);
    const used = new Set(all.flatMap((r) => classesIn(r.sel)));
    for (const c of used) if (!reg.names.includes(c)) add("C1", `대장에 없는 클래스: .${c}`);
  }

  for (const r of all) {
    /* C2 금지된 이름 */
    for (const c of classesIn(r.sel)) if (BAD_NAME.test(c)) add("C2", `한 글자·한 낱말 상태 이름: .${c}  (${r.sel})`);

    for (const { prop, val } of r.d) {
      /* C4 grid 의 맨 1fr — minmax 를 먼저 지우고 본다 */
      if (/^grid-template(-columns|-rows)?$/.test(prop)) {
        const v = val.replace(/minmax\([^)]*\)/g, " ");
        if (/(^|[\s,(])[\d.]*fr\b/.test(v)) add("C4", `grid 에 맨 fr — 내용보다 안 작아진다. minmax(0,1fr) 로: ${r.sel} { ${prop}: ${val} }`);
      }
      /* C6 늘어나는 칸에 basis 가 없다 (줄임말만. longhand 는 규칙 단위로 아래에서 본다) */
      if (prop === "flex") {
        const p = val.trim().split(/\s+/);
        const grow = Number(p[0]);
        const basis = p.length >= 3 ? p[2] : p.length === 2 && /[a-z%]/.test(p[1]) ? p[1] : null;
        if (grow >= 1 && (basis === null || /^0(px|%)?$/.test(basis)))
          add("C6", `늘어나는 칸에 basis 가 없다 → 390px 에서 한 글자씩 쌓인다: ${r.sel} { flex: ${val} }`);
      }
      /* C8 투명도로 흐리게 — 「끄는 중」 한 자리만 봐준다 */
      if (prop === "opacity" && Number(val) < 1 && !/\.is-drag\b/.test(r.sel))
        add("C8", `투명도로 흐리게 했다. 「덜 중요함」은 색으로: ${r.sel} { opacity: ${val} }`);
      /* C9 글씨 크기 — 토큰만 쓴다. 0.5px 단 금지 */
      if (prop === "font-size" && !/^:root/.test(r.sel)) {
        if (/\d\.\d*5px/.test(val)) add("C9", `0.5px 단 글씨: ${r.sel} { font-size: ${val} }`);
        else if (/\d/.test(val) && !/var\(--fs\d/.test(val)) add("C9", `토큰 아닌 글씨 크기: ${r.sel} { font-size: ${val} }`);
      }
      /* C10 한글 자리에 고정폭 글꼴 */
      if (prop === "font-family" && MONO_RE.test(val) && !/(^|[\s,>])(code|pre|kbd)\b|\.mono\b/.test(r.sel))
        add("C10", `고정폭 글꼴이 한글에 걸릴 자리에 있다: ${r.sel} { font-family: ${val} }`);
      /* C7-c PC 입력칸이 14px 보다 작으면 못 읽는다
       * ⚠️ 값을 **px 로 풀어서** 본다. 전에는 `val.match(/(\d+)px/)` 라
       *    `font-size: var(--fs6)` 을 못 읽었다 — C9 가 「토큰으로 쓰라」고 시키는 대로
       *    쓰는 순간 C7 이 눈을 감아, 규칙을 지키며 쓴 오류 104 는 영원히 안 잡혔다(실측). */
      if (prop === "font-size" && INPUTISH.test(r.sel) && !/pointer\s*:\s*coarse/.test(r.media)) {
        const size = px(val);
        if (size && size < 14) add("C7", `입력칸 글씨가 14px 미만: ${r.sel} { font-size: ${val} }`);
        if (size >= 16 && /max-width/.test(r.media))
          add("C7", `⚠️ 입력칸 16px 를 **폭**으로 걸었다 — 아이패드(768px)가 빠진다. (pointer:coarse) 로: ${r.media} { ${r.sel} { font-size: ${val} } }`);
      }
    }

    /* C6-b longhand — ⚠️ `flex-grow:1; flex-basis:0` 으로 나눠 적으면 위 줄임말 검사를
     *    통째로 빠져나간다(실측 「0건」). 오류 94 가 40곳에 있었던 그 잘못이다.
     *    같은 규칙에 `flex:` 줄임말이 **뒤에** 있으면 그쪽이 이기므로 그때는 안 본다. */
    const iShort = r.d.map((d) => d.prop).lastIndexOf("flex");
    const iGrow = r.d.map((d) => d.prop).lastIndexOf("flex-grow");
    const iBasis = r.d.map((d) => d.prop).lastIndexOf("flex-basis");
    if (iGrow >= 0 && iGrow > iShort) {
      const grow = Number(r.d[iGrow].val);
      const basis = iBasis > iShort ? r.d[iBasis].val.trim() : null;
      if (grow >= 1 && (basis === null || /^0(px|%|em|rem)?$/.test(basis)))
        add("C6", `늘어나는 칸에 basis 가 없다 → 390px 에서 한 글자씩 쌓인다: ${r.sel} { flex-grow: ${r.d[iGrow].val}${basis === null ? "" : `; flex-basis: ${basis}`} }`);
    }
  }

  /* C3 min-width:0 — flex·grid 를 쓰면서 자식을 줄여 주는 규칙이 없으면 부모가 밀린다 */
  const usesFlexGrid = all.some((r) => r.d.some((d) => d.prop === "display" && /(^|-)(flex|grid)$/.test(d.val.trim())));
  const hasShrink = all.some((r) => /^(\*|:where\(\*\)|:root|html|body)/.test(r.sel.trim()) && r.d.some((d) => d.prop === "min-width" && /^0/.test(d.val)));
  if (usesFlexGrid && !hasShrink) add("C3", "flex·grid 를 쓰는데 `min-width:0` 을 널리 주는 규칙이 없다 — 표·긴 글이 부모를 밀어낸다");

  /* C5 한글 줄바꿈 */
  if (!all.some((r) => /^(\*|:root|html|body)/.test(r.sel.trim()) && r.d.some((d) => d.prop === "word-break" && /keep-all/.test(d.val))))
    add("C5", "`word-break: keep-all` 이 몸통에 없다 — 한글이 한 글자씩 쌓인다");

  /* C7-a 손가락 기계에서 입력칸 16px */
  if (!all.some((r) => /pointer\s*:\s*coarse/.test(r.media) && INPUTISH.test(r.sel) &&
                       r.d.some((d) => d.prop === "font-size" && px(d.val) >= 16)))
    add("C7", "`(pointer:coarse)` 에서 입력칸을 16px 로 올리는 규칙이 없다 — 아이폰이 강제로 확대하고 확대가 남는다");

  /* C7-d PC 기본 규칙과 손가락 규칙의 **대상이 같아야** 한다
   * ⚠️ 손가락 규칙은 `.fld, input, select, textarea` 넷을 올리는데 기본 규칙이 `.fld` 하나면,
   *    클래스 없는 `<input>` 이 PC 에서 브라우저 기본값(실측 13.3px·Arial)으로 남는다. */
  if (wantRegistry) {
    const tagsIn = (re) => new Set(all.filter((r) => re.test(r.media || "") && INPUTISH.test(r.sel) && r.d.some((d) => d.prop === "font-size"))
      .flatMap((r) => (r.sel.match(/(^|[\s,>])(input|select|textarea)\b/g) || []).map((s) => s.trim().replace(/^[,>]/, "").trim())));
    const coarseTags = tagsIn(/pointer\s*:\s*coarse/);
    const baseTags = tagsIn(/^$/);
    for (const t of coarseTags) if (!baseTags.has(t))
      add("C7", `손가락 규칙은 \`${t}\` 도 올리는데 PC 기본 규칙에는 없다 — PC 에서 브라우저 기본값(13.3px)으로 남는다`);
  }

  /* C11 배색 다섯 */
  if (wantRegistry) {
    for (const s of ["auto", "deep", "warm", "paper", "bright"])
      if (!new RegExp(`\\[data-skin\\s*=\\s*"${s}"\\]`).test(src)) add("C11", `배색 ${s} 가 없다 (다섯이어야 한다)`);
    const deep = all.find((r) => /\[data-skin="deep"\]/.test(r.sel));
    // ⚠️ `var(--d-bg)` 로 적혀 있어도 실제 색으로 풀어서 본다
    const v = (p) => resolveVar(deep?.d.find((d) => d.prop === p)?.val || "", TOK).toUpperCase();
    if (v("--bg") !== "#0D1219") add("C12", `딥네이비 바탕이 #0D1219 가 아니다 (${v("--bg") || "없음"})`);
    if (v("--surface") !== "#1B2432") add("C12", `딥네이비 카드가 #1B2432 가 아니다 (${v("--surface") || "없음"})`);
  }

  /* C15 ⚠️ 배색 **한 벌이 두 군데**에 적혀 있다 (원칙 1 — 같은 값 두 벌 금지)
   * 「기계가 어두울 때」와 「딥네이비」가 열 줄을 바이트까지 똑같이 두 벌 적고 있었다.
   * 그러면 한쪽만 고쳤을 때 다른 쪽이 남고, **특정도가 높은 쪽이 이겨** 화면은 안 바뀐다.
   * (실측: 딥네이비 --bg 를 고쳤더니 밝은 기계에서만 바뀌고 다크 맥에서는 옛 값)
   * `var(...)` 로 한 벌을 가리키는 것은 세지 않는다 — 그게 고친 모양이다. */
  {
    const KEY = ["--bg", "--surface", "--sunk", "--line"];
    const lit = (r) => { const o = {}; for (const d of r.d) if (KEY.includes(d.prop) && !/var\(/.test(d.val)) o[d.prop] = d.val.trim().toUpperCase(); return o; };
    const pal = all.map((r) => ({ r, t: lit(r) })).filter((x) => Object.keys(x.t).length === KEY.length);
    for (let i = 0; i < pal.length; i++) for (let j = i + 1; j < pal.length; j++)
      if (KEY.every((k) => pal[i].t[k] === pal[j].t[k]))
        add("C15", `배색 한 벌이 두 군데에 그대로 적혀 있다 — 한쪽만 고치면 다른 쪽이 남는다: 「${pal[i].r.media ? pal[i].r.media + " " : ""}${pal[i].r.sel}」 와 「${pal[j].r.media ? pal[j].r.media + " " : ""}${pal[j].r.sel}」`);
  }

  /* C13 ⚠️ 오류 100 — 미디어 규칙이 **뒤에 오는 같은 선택자**에 밀려 안 먹는다 */
  const later = new Map();  // "sel|prop" -> 마지막 위치(비-미디어)
  all.forEach((r, i) => { if (!r.media) for (const d of r.d) later.set(`${r.sel}|${d.prop}`, i); });
  all.forEach((r, i) => {
    if (!r.media) return;
    for (const d of r.d) {
      const j = later.get(`${r.sel}|${d.prop}`);
      if (j != null && j > i) add("C13", `미디어 규칙이 뒤 규칙에 밀려 안 먹는다: ${r.media} { ${r.sel} { ${d.prop} } } 뒤에 같은 것이 또 있다`);
    }
  });

  /* C14 토큰을 미디어 **안에서만** 정하면, 배색을 고르는 순간 그 토큰이 빈다 */
  const rootTokens = new Set(all.filter((r) => !r.media && /^:root/.test(r.sel)).flatMap((r) => r.d.filter((d) => d.prop.startsWith("--")).map((d) => d.prop)));
  for (const r of all) if (r.media) for (const d of r.d)
    if (d.prop.startsWith("--") && !rootTokens.has(d.prop)) add("C14", `토큰 ${d.prop} 가 미디어 안에서만 정해진다 — 다른 배색에서 빈다`);

  return { bad, rules: all, registry: reg };
}

/* ── 글씨 크기 토큰 열 종 · 대비 재기 ─────────────────────────────── */
const hex = (s) => { const m = /^#([0-9a-f]{6})$/i.exec(s.trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** 규칙 하나에서 토큰 값을 모은다 (한 배색 = 한 벌) */
function tokensOf(rules, selRe) {
  const t = {};
  for (const r of rules) if (selRe.test(r.sel)) for (const d of r.d) if (d.prop.startsWith("--")) t[d.prop] = d.val.trim();
  return t;
}

/* ══════════════════════════════════════════════════════════════════════
 * 2부 — 진짜 브라우저 (크롬을 CDP 로 몬다. playwright 는 이 기계에 없다)
 * ══════════════════════════════════════════════════════════════════════ */
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p)) || null;

async function openBrowser() {
  const dir = mkdtempSync(join(tmpdir(), "chk-layout-"));
  const proc = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "about:blank"],
    { stdio: ["ignore", "ignore", "ignore"] });
  let port = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const f = join(dir, "DevToolsActivePort");
    if (existsSync(f)) { const s = readFileSync(f, "utf8").split("\n"); if (s[0]?.trim()) { port = s[0].trim(); break; } }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) { proc.kill(); throw new Error("크롬이 디버깅 포트를 안 열었다"); }
  /** ⚠️ 탭을 **새로 연다.** `Emulation.setTouchEmulationEnabled({enabled:false})` 는
   *    한 번 켠 뒤로 `pointer:fine` 을 **되돌리지 못한다**(실측:
   *    `[실측] 1400px 요청=PC → {"coarse":true,"hoverNone":true,"maxTouch":5}`).
   *    그래서 폰 셋을 먼저 돌던 옛 판은 PC 폭도 손가락 규칙으로 쟀다 —
   *    「1400px 입력칸 14px 이상」이 실은 16px 를 재고 있었고, **오류 103 을
   *    영원히 못 잡았다.** `setEmulatedMedia` 로도 안 되돌아간다(확인함).
   *    새 탭이 유일하게 확실한 방법이다. */
  const newPage = async () => {
    const tgt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(tgt.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
    let id = 0; const waiting = new Map();
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Page.enable"); await send("Runtime.enable");
    const close = async () => { try { ws.close(); } catch {} try { await fetch(`http://127.0.0.1:${port}/json/close/${tgt.id}`); } catch {} };
    return { send, close };
  };
  return { newPage, close: () => proc.kill() };
}

/** 브라우저 안에서 도는 검사 여섯 + 곁가지 셋. ⚠️ 이 글은 페이지 안에서 실행된다 */
const AUDIT = `(() => {
  const S = (e) => getComputedStyle(e);
  const nm = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\\s+/).join(".") : "")
                  + " «" + (e.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 26) + "»";
  const scrollBox = (e) => { const s = S(e); return /(auto|scroll|hidden)/.test(s.overflowX) || /(auto|scroll|hidden)/.test(s.overflowY); };
  const scrollX   = (e) => /(auto|scroll)/.test(S(e).overflowX);
  const hasScrollAncestor = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (scrollBox(p)) return true; return false; };
  const KOR = /[가-힣]/;
  const MONO = /monospace|menlo|consolas|courier|sfmono|sf mono|ui-monospace|jetbrains|d2coding/i;
  const hit = [];
  const put = (k, e, why) => hit.push({ k, el: nm(e), why });
  const els = [...document.querySelectorAll("body *")];

  for (const e of els) {
    const s = S(e), r = e.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden") continue;
    const fixed = s.position === "absolute" || s.position === "fixed";
    const inline = s.display === "inline";
    const leaf = e.children.length === 0;
    const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();

    // ① 부모보다 오른쪽으로 삐져나감 (스크롤 상자는 뺀다 — hidden 도 스크롤 상자다)
    const p = e.parentElement;
    if (p && p !== document.body && p !== document.documentElement && !fixed && !scrollBox(p)) {
      const pr = p.getBoundingClientRect(), right = pr.left + p.clientLeft + p.clientWidth;
      if (r.width > 0 && r.right - right > 1) put(1, e, "부모보다 " + Math.round(r.right - right) + "px 오른쪽으로 나감 (부모 " + nm(p) + ")");
    }
    // ③ 세로로 쌓인 글자 — 폭 80px 미만이고 높이가 폭의 2.2배 넘는 잎 노드
    // ⚠️ 상자 높이로만 재면 **헛짚는다** — 옆 칸이 길어서 줄이 통째로 높아진 표 칸이
    //    전부 「세로로 쌓임」으로 잡혔다. 글의 **줄 상자**를 세어 한 줄에 몇 자인지를 본다.
    if (leaf && own && r.width > 0 && r.width < 80 && r.height > r.width * 2.2 && r.height > 30) {
      const rg = document.createRange(); rg.selectNodeContents(e);
      const lines = [...rg.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
      const chars = own.replace(/\\s/g, "").length;
      if (lines.length >= 3 && chars / lines.length <= 2.5 && Math.max(...lines.map((x) => x.width)) < 80)
        put(3, e, Math.round(r.width) + "px 폭에 " + lines.length + "줄 · 한 줄에 " + (chars / lines.length).toFixed(1) + "자 — 글자가 세로로 쌓였다");
    }
    // ④ 잘린 글자 — ⚠️ 잎 노드만 보면 놓친다(오류 93). 블록 요소에도 건다.
    // ⚠️ 읽어주기 전용 글(.sronly)은 **일부러** 1px 이다. 안 빼면 이름 대장에 있는
    //    .sronly 를 쓰는 첫 화면에서 네 폭 전부 거짓으로 빨개진다(실측 4건).
    //    그러면 고치는 사람이 읽어주기 글을 지워 버린다 — 검사가 접근성을 망친다.
    const hiddenForSighted = (r.width < 2 && r.height < 2) || (s.clipPath && s.clipPath !== "none");
    if (!/^(input|textarea|select)$/.test(e.tagName.toLowerCase()) && e.dataset.clip !== "ok" && !scrollX(e) && !hiddenForSighted
        && e.scrollWidth - e.clientWidth > 1 && e.clientWidth > 0)
      put(4, e, "안쪽 글이 " + e.scrollWidth + "px 인데 칸은 " + e.clientWidth + "px — 뒤가 잘려 없는 것이 된다");
    // ⑤ 화면 밖으로 나감
    if (!fixed && r.width > 0 && (r.right - innerWidth > 1 || r.left < -1) && !hasScrollAncestor(e))
      put(5, e, "화면(" + innerWidth + "px) 밖으로 " + Math.round(Math.max(r.right - innerWidth, -r.left)) + "px");
    // ⑥ 늘어난 단추
    if ((e.tagName === "BUTTON" || e.classList.contains("btn") || e.getAttribute("role") === "button")
        && r.height > 58 && r.width < 120 && r.width > 0)
      put(6, e, Math.round(r.width) + "×" + Math.round(r.height) + " — 단추가 세로로 늘어났다");
    // ⑦ 한글에 고정폭 글꼴 (오류 107)
    if (own && KOR.test(own) && MONO.test(s.fontFamily))
      put(7, e, "한글인데 고정폭 글꼴: " + s.fontFamily.split(",")[0]);
    // ⑧ 투명도로 흐리게 (계획 ㉑) — 「끄는 중」만 봐준다
    if (Number(s.opacity) < 1 && !e.classList.contains("is-drag"))
      put(8, e, "opacity " + s.opacity + " — 「덜 중요함」은 색으로 말한다");
    // ⑨ 붙박이가 조용히 안 붙는다
    // ⚠️ 전에는 조상의 overflow 가 **hidden 일 때만** 봤다. 그래서 .tblwrap 의
    //    overflow-x:auto 한 줄로 표 머리가 **한 번도 안 붙는** 것을 네 폭 전부 0건으로 통과시켰다.
    //    CSS 규정상 한 축이 visible 이 아니면 다른 축은 auto 로 계산되므로,
    //    auto·scroll 도 hidden 과 똑같이 붙박이를 가둔다. 갇힌 상자가
    //    세로로 안 구르면 머리는 페이지와 함께 그냥 흘러 나간다 (실측 top 74 → -626).
    if (s.position === "sticky" && s.top !== "auto") {
      let box = null;
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const as = S(a);
        if (as.overflowY !== "visible" || as.overflowX !== "visible") { box = a; break; }
      }
      if (box) {
        const bs = S(box);
        const userCanScroll = /(auto|scroll)/.test(bs.overflowY);
        const doesScroll = box.scrollHeight - box.clientHeight > 1;
        if (!userCanScroll)
          put(9, e, "조상 " + nm(box) + " 이 overflow-y:" + bs.overflowY + " 라 **오류 없이 그냥 안 붙는다**");
        else if (!doesScroll && box.getBoundingClientRect().height > innerHeight * 0.6)
          put(9, e, "조상 " + nm(box) + " 이 붙박이를 가두는데 세로로 안 구른다(" + box.scrollHeight + " ≤ " + box.clientHeight
                  + ") — 머리가 페이지와 함께 흘러 나간다. **오류 없이 그냥 안 붙는다**");
      }
    }
  }

  // ② 형제끼리 겹침 — 전 요소를 훑고 inline·absolute 는 뺀다
  // ⚠️ 붙박이(sticky)도 뺀다. 화면 아래 붙는 줄은 **원래** 뒤 내용을 덮으므로
  //    안 빼면 바닥 단추 줄 하나가 폭마다 걸려 진짜 겹침이 그 밑에 묻힌다.
  //    붙박이의 사고(㉜ 1 — 표 머리가 표 밖으로 튀어나와 다른 카드를 덮음)는
  //    ①(부모 밖으로)과 ⑨(조상이 hidden)가 대신 본다. 그리고 .tblwrap 의 position:relative 가 구조로 막는다.
  const byParent = new Map();
  for (const e of els) {
    const s = S(e), r = e.getBoundingClientRect();
    if (s.display === "none" || s.display === "inline" || s.display === "contents" || s.visibility === "hidden") continue;
    if (s.position === "absolute" || s.position === "fixed" || s.position === "sticky") continue;
    if (r.width < 2 || r.height < 2) continue;
    const key = e.parentElement; if (!key) continue;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push([e, r]);
  }
  for (const [, list] of byParent) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [ea, ra] = list[i], [eb, rb] = list[j];
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 2 && h > 2) hit.push({ k: 2, el: nm(ea) + "  ↔  " + nm(eb), why: "형제끼리 " + Math.round(w) + "×" + Math.round(h) + " 겹친다" });
  }
  return JSON.stringify(hit);
})()`;

/** 한 폭·한 기계에서 페이지를 열고 글 하나를 돌려 값을 받는다.
 *  ⚠️ 폭마다 **새 탭**이다 (위 newPage 의 까닭 참고). */
async function onPage(br, url, width, coarse, expressions) {
  // ⚠️ `mobile:true` 를 쓰면 안 된다 — 내용이 화면보다 넓을 때 크롬이 **레이아웃 폭을 내용에 맞춰 늘려**
  //    320px 를 달라 했는데 1200px 로 재게 된다(실측). 그러면 「화면 밖으로 나감」이 영원히 0건이다.
  //    손가락 기계 여부는 폭이 아니라 **터치 흉내**로 준다 — `(pointer:coarse)` 는 그걸 본다.
  const p = await br.newPage();
  try {
    await p.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await p.send("Emulation.setTouchEmulationEnabled", { enabled: coarse, maxTouchPoints: coarse ? 5 : 0 });
    await p.send("Page.navigate", { url });
    for (let i = 0; i < 60; i++) {
      const r = await p.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
      if (r.result?.result?.value === "complete") break;
      await new Promise((r2) => setTimeout(r2, 100));
    }
    await new Promise((r) => setTimeout(r, 120));            // 글꼴이 앉을 시간
    const out = [];
    for (const expr of expressions) {
      const res = await p.send("Runtime.evaluate", { expression: expr, returnByValue: true });
      if (res.result?.exceptionDetails) throw new Error("페이지 안 검사가 터졌다: " + JSON.stringify(res.result.exceptionDetails).slice(0, 200));
      out.push(res.result.result.value);
    }
    return out;
  } finally { await p.close(); }
}

/** 이 탭이 정말 우리가 시킨 기계인가 — ⚠️ 「PC 라고 적고 손가락으로 쟀다」를 다시는 안 겪는다 */
const POINTER_PROBE = `JSON.stringify({coarse:matchMedia("(pointer:coarse)").matches,fine:matchMedia("(pointer:fine)").matches,hoverNone:matchMedia("(hover:none)").matches})`;

/** 붙박이 표 머리가 **진짜 붙는가** — 상자를 굴려 보고 잰다 (재는 것이 곧 재현이다) */
const STICKY_PROBE = `(() => {
  const th = document.querySelector(".hdstick th");
  if (!th) return JSON.stringify({ why: "본보기에 .hdstick 이 없다" });
  const box = th.closest(".tblwrap") || document.scrollingElement;
  const t0 = th.getBoundingClientRect().top;
  box.scrollTop = 400;
  const moved = box.scrollTop;
  const t1 = th.getBoundingClientRect().top;
  return JSON.stringify({ pos: getComputedStyle(th.parentElement).position, moved, t0: Math.round(t0), t1: Math.round(t1) });
})()`;

/** 배색 아홉 토큰을 그대로 읽는다 (기계 배색을 바꿔 가며 견주려고) */
const SKIN_PROBE = (skin) => `(() => {
  document.documentElement.dataset.skin = ${JSON.stringify(skin)};
  const s = getComputedStyle(document.documentElement);
  const t = {};
  for (const k of ["--bg","--surface","--sunk","--line","--fg","--mid","--mute","--accent","--accent-fg"]) t[k] = s.getPropertyValue(k).trim();
  return JSON.stringify(t);
})()`;

/* ══════════════════════════════════════════════════════════════════════
 * 3부 — 진짜 글자로 그린 본보기 화면
 * ⚠️ 「Lorem ipsum」으로는 안 깨진다. 우리 DB 의 **가장 긴 단원 이름**으로 깨진다.
 * ══════════════════════════════════════════════════════════════════════ */
async function realStrings() {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  for (let i = 1; ; i++) { try { await c.connect(); break; } catch (e) { if (i >= 3) throw e; await new Promise((r) => setTimeout(r, 2500)); } }
  // ⚠️ 값은 $1 로 넣는다. SQL 안에 글자를 끼워 넣지 않는다
  const q = async (sql, lim) => (await c.query(sql, [lim])).rows.map((r) => r.t);
  const units = await q("select v2.unit_label(id) t from v2.units order by length(v2.unit_label(id)) desc limit $1", 3);
  const books = await q("select name t from v2.books order by length(name) desc, name limit $1", 3);
  const studs = await q("select name t from v2.students order by length(name) desc, name limit $1", 8);
  let klass = [];
  try { klass = await q("select name t from v2.classes order by length(name) desc, name limit $1", 3); } catch { klass = []; }
  await c.end();
  return { units, books, studs, klass: klass.length ? klass : ["중3 월수금 A"] };
}

const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));

function sampleHtml(css, r) {
  /* ⚠️ 본보기 표는 **진짜 화면만큼 칸이 많아야** 한다.
   *    5칸·짧은 글짜리 본보기로는 `.tbl` 에 min-width 가 없어 한글이 한 줄에 2자씩
   *    세로로 쌓이던 자리가 영원히 초록이었다 (진짜 9칸 표로는 320·390·768px 에서 8건).
   *    줄 수도 늘린다 — `.tblwrap` 이 세로로 진짜 굴러야 붙박이 머리를 잴 수 있다. */
  const row = (s, i) => `<tr><td>${esc(s)}</td><td>${esc(r.klass[i % r.klass.length])}</td>
    <td>${esc(r.books[i % r.books.length] || "")}</td><td>${esc(r.units[i % r.units.length] || "")}</td>
    <td>단어 30개</td><td class="num">12 / 18</td><td class="num">28 / 30</td>
    <td><span class="pill pillok">통과</span></td><td><button class="btn">열기</button></td></tr>`;
  const rows = Array.from({ length: 24 }, (_, i) => row(r.studs[i % r.studs.length], i)).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>본보기</title>
<style>${css}</style></head><body><div class="wrap"><div class="stack">

<h1>오늘 수업</h1>
<h2 class="sronly">숙제 검사 표</h2>

<div class="card">
  <div class="cardhd">배색<span class="muted">기본 · 딥네이비 · 따뜻하게 · 종이 · 밝게</span></div>
  <div class="skinpick">
    <button class="skinbtn is-sel">기본</button><button class="skinbtn">딥네이비</button>
    <button class="skinbtn">따뜻하게</button><button class="skinbtn">종이</button><button class="skinbtn">밝게</button>
  </div>
</div>

<div class="card">
  <div class="cardhd">숙제 검사</div>
  <div class="row">
    <span class="pill pillok">통과</span><span class="pill pillwarn">다시</span>
    <span class="pill pillbad">안 함</span><span class="pill pillinfo">늦귀가</span><span class="pill pilloff">멈춤</span>
  </div>
  <div class="tblwrap"><table class="tbl">
    <thead><tr class="hdstick"><th>이름</th><th>반</th><th>교재</th><th>단원</th><th>숙제</th>
      <th>진도</th><th>단어</th><th>상태</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <p class="muted">${esc(r.books[0] || "")} — 덜 중요한 글은 흐리게가 아니라 색으로 말한다.</p>
</div>

<div class="card">
  <div class="cardhd">한 줄에 여럿</div>
  <div class="row">
    <div class="grow"><label class="lbl">학생</label><input class="fld" value="${esc(r.studs[0] || "")}"></div>
    <div class="grow"><label class="lbl">교재</label><input class="fld" value="${esc(r.books[0] || "")}"></div>
    <div class="grow"><label class="lbl">메모</label><input class="fld" placeholder="여기에 적는다"></div>
  </div>
  <!-- ⚠️ 클래스 없는 입력칸도 **일부러** 그린다. 본보기의 입력칸이 전부 .fld 라
       PC 에서 맨 input·select 가 13.3px·Arial 로 남던 것을 검사가 못 봤다 -->
  <div class="row">
    <div class="grow"><label class="lbl">반</label><select><option>${esc(r.klass[0])}</option></select></div>
    <div class="grow"><label class="lbl">메모(클래스 없음)</label><input placeholder="여기에 적는다"></div>
    <div class="grow"><label class="lbl">상담</label><textarea rows="2">${esc(r.units[0] || "")}</textarea></div>
  </div>
  <div class="mdlf"><button class="btn btnghost">취소</button><button class="btn btnmain">저장</button></div>
</div>

<!-- ⚠️ 이름 대장에 있는데 한 번도 안 그려 본 클래스 — 안 그리면 검사가 통과시켜도 뜻이 없다 -->
<div class="card">
  <div class="cardhd">덮개 판과 코드 자리</div>
  <div class="mdl">
    <div class="cardhd">보강 잡기</div>
    <p class="muted">${esc(r.units[0] || "")}</p>
    <p class="mono">select id, name from v2.students order by name limit 20;</p>
    <div class="mdlf"><button class="btn btnghost">취소</button><button class="btn btnmain">저장</button></div>
  </div>
</div>

<div class="card">
  <div class="cardhd">달력</div>
  <div class="calwrap"><div class="cal">
    ${["일","월","화","수","목","금","토"].map((d) => `<div class="calday"><b>${d}</b><div class="chip">보강</div></div>`).join("")}
  </div></div>
</div>

<div class="card">
  <div class="cardhd">남은 것</div>
  <div class="snaprow">
    ${r.units.map((u) => `<div class="snapcol"><div class="sunk">${esc(u)}</div></div>`).join("")}
  </div>
  <div class="acc is-open"><div class="row"><b>지나온 것</b><span class="chip">3</span></div>
    <div class="accbd"><small>${esc(r.units[1] || "")}</small></div></div>
  <div class="col"><span class="muted">끄는 중</span><span class="chip is-drag">${esc(r.studs[0] || "")}</span></div>
</div>

<div class="barfix"><div class="row"><span class="muted">저장됨</span><button class="btn btnmain">마감</button></div></div>
</div></div></body></html>`;
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("■ 배색·레이아웃 검사");
console.log(chromePath ? `   브라우저: ${chromePath.split("/").pop()}  (320·390·768·1400 폭에서 **진짜로 그려** 잰다)`
                       : "   ⚠️ **브라우저가 없다 — 얕은 검사(글자 훑기)만 돌았다.** 화면을 실제로 그려 보지 못했다.");

/* ── 1부 ── */
console.log("\n■ 1부 — app/globals.css 를 글자로 훑는다");
const rawCss = readFileSync(CSS_PATH, "utf8");
const g = auditCss(rawCss, { wantRegistry: true });
ok("globals.css 가 규칙을 하나도 안 어긴다", g.bad.length === 0);
g.bad.forEach((b) => console.log(`        [${b.code}] ${b.why}`));

/* ⚠️ 이어져 있는가 — 검사가 안 지키는 것은 곧 사라진다.
 *    globals.css 를 아무도 안 부르는 채로 86건·실패 0 이 뜬 적이 있다.
 *    브라우저에 색 한 줄 안 가는데 배색 검사가 통째로 초록이었다. */
const layoutJs = existsSync(LAYOUT_PATH) ? readFileSync(LAYOUT_PATH, "utf8") : "";
ok("app/layout.js 가 globals.css 를 불러온다", /import\s+["']\.\/globals\.css["']/.test(layoutJs),
   "`import \"./globals.css\"` 가 없다 — 화면에 색이 한 줄도 안 간다");
ok("<head> 에서 고른 배색을 되살린다", /localStorage\.getItem\(\s*['"]skin['"]\s*\)/.test(layoutJs) && /dataset\.skin/.test(layoutJs),
   "`localStorage.getItem('skin')` 복원 줄이 없다 — 첫 그림이 흰 화면으로 번쩍인다");

// 글씨 크기 토큰 열 종
const rootRule = g.rules.filter((r) => !r.media && /^:root/.test(r.sel));
const fs = rootRule.flatMap((r) => r.d.filter((d) => /^--fs\d+$/.test(d.prop)));
const fsVals = fs.map((d) => d.val.trim());
ok("글씨 크기 토큰이 **열 종**이다 (오류 106)", new Set(fs.map((d) => d.prop)).size === 10, `${new Set(fs.map((d) => d.prop)).size}종`);
ok("토큰에 0.5px 단이 없다", !fsVals.some((v) => /\.\d/.test(v)), fsVals.filter((v) => /\.\d/.test(v)).join(" "));
ok("토큰 값이 서로 다르다", new Set(fsVals).size === fsVals.length);

// 대비 — ⚠️ 값을 지어내지 않는다. 파일의 진짜 색으로 **재서** 적는다
console.log("\n■ 대비 — 투명도를 없앤 자리를 색이 실제로 메우는지 (계획 ㉑)");
const SKINS = [["기본(밝을 때)", /^:root(,|$)|:root\[data-skin="auto"\]/],
               ["기본(어두울 때)", /:root:not\(\[data-skin="paper"\]\)/],
               ["딥네이비", /\[data-skin="deep"\]/], ["따뜻하게", /\[data-skin="warm"\]/],
               ["종이", /\[data-skin="paper"\]/], ["밝게", /\[data-skin="bright"\]/]];
const base = tokensOf(g.rules, /^:root(,|\s|$)|:root\[data-skin="auto"\]/);
for (const [name, re] of SKINS) {
  const t = { ...base, ...tokensOf(g.rules, re) };
  const pairs = [["본문", "--fg", "--surface", 7], ["조금 약한 글", "--mid", "--surface", 4.5],
                 ["가장 약한 글", "--mute", "--surface", 4.5], ["가라앉은 자리의 글", "--mute", "--sunk", 4],
                 ["좋음 알약", "--ok-fg", "--ok-bg", 4.5], ["살핌 알약", "--warn-fg", "--warn-bg", 4.5],
                 ["나쁨 알약", "--bad-fg", "--bad-bg", 4.5], ["꺼짐 알약", "--off-fg", "--off-bg", 4.5],
                 ["주 단추", "--accent-fg", "--accent", 4.5]];
  const line = [];
  for (const [what, a, b, need] of pairs) {
    // ⚠️ `var(--d-bg)` 처럼 한 벌을 가리키는 값도 **실제 색으로 풀어서** 잰다
    const ca = hex(resolveVar(t[a] || "", t)), cb = hex(resolveVar(t[b] || "", t));
    if (!ca || !cb) { fail++; n++; console.log(`   ❌ ${name} — ${what}: 색 토큰이 비었다 (${a}=${t[a]} ${b}=${t[b]})`); continue; }
    const v = ratio(ca, cb); n++;
    if (v < need) { fail++; console.log(`   ❌ ${name} — ${what} ${v.toFixed(2)}:1 (${need} 이상이어야 한다)`); }
    else line.push(`${what} ${v.toFixed(1)}`);
  }
  if (line.length === pairs.length) console.log(`   ✅ ${name} — ${line.join(" · ")}`);
}

/* ── 1부-b : 일부러 어기는 본보기를 글자 훑기가 잡는가 ── */
console.log("\n■ 1부-b — 일부러 어기는 본보기를 **글자 훑기가 잡는가**");
const fixRaw = readFileSync(FIXTURE, "utf8");
const fixCss = (fixRaw.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
const f = auditCss(fixCss, { wantRegistry: false });
const codes = new Set(f.bad.map((b) => b.code));
for (const [c, what] of [["C2", "한 글자·한 낱말 상태 이름"], ["C3", "min-width:0 없음"], ["C4", "grid 의 맨 1fr"],
                         ["C5", "word-break:keep-all 없음"], ["C6", "basis 없는 flex:1"], ["C7", "입력칸 16px 를 폭으로 걸었다"],
                         ["C8", "투명도로 흐리게"], ["C9", "0.5px 단 글씨"], ["C10", "한글에 고정폭 글꼴"], ["C13", "미디어 규칙이 뒤에 밀림"],
                         ["C15", "배색 한 벌을 두 군데에 적었다"]])
  ok(`본보기의 「${what}」을 잡았다`, codes.has(c), `[${c}] 를 못 잡았다 — **검사에 구멍이 있다**`);

/* ⚠️ 「어느 코드가 떴나」만 보면 구멍이 남는다 — 같은 잘못을 **다르게 적었을 때**도
 *    잡는지를 낱낱이 본다. 아래 셋은 전부 실제로 빠져나가던 통로다. */
const why = (c) => f.bad.filter((b) => b.code === c).map((b) => b.why).join(" | ");
ok("본보기의 「longhand 로 적은 basis 없는 flex」를 잡았다", /flex-grow/.test(why("C6")),
   "`flex-grow:1; flex-basis:0` 을 못 잡았다 — 오류 94 가 longhand 로 다시 들어온다");
ok("본보기의 「font: 줄임말에 숨긴 0.5px·고정폭」을 잡았다", /12\.5px/.test(why("C9")) && /Menlo/.test(why("C10")),
   "`font: 700 12.5px/1.4 Menlo` 를 못 잡았다 — 오류 106·107 을 한 줄에 같이 저지르면 통과한다");
ok("본보기의 「토큰으로 적은 입력칸 16px 를 폭으로」를 잡았다", /var\(--fs6\)/.test(why("C7")),
   "`font-size: var(--fs6)` 을 못 잡았다 — C9 가 시키는 대로 쓰는 순간 C7 이 눈을 감는다");

/* ⚠️ 이름 대장에 있는데 본보기가 **한 번도 안 그리는** 클래스가 있으면,
 *    그 클래스에 대해서는 브라우저 검사 아홉이 통과시켜도 아무 뜻이 없다.
 *    `.sronly` 가 그랬다 — 안 그려 봐서 「쓰는 순간 거짓으로 빨개진다」를 아무도 몰랐다. */
{
  const dummy = { units: ["단원 라벨"], books: ["교재"], studs: ["학생"], klass: ["반"] };
  const html = sampleHtml("", dummy);
  const undrawn = g.registry.names.filter((c) => !new RegExp(`class="[^"]*\\b${c.replace(/[-]/g, "\\-")}\\b`).test(html));
  ok("이름 대장의 클래스를 본보기가 **전부 그려 본다**", undrawn.length === 0,
     `안 그려 보는 것: ${undrawn.map((c) => "." + c).join(" ")} — 안 그리는 클래스는 검사가 통과시켜도 뜻이 없다`);
}

/* ⚠️ 거짓 실패도 검사의 고장이다 — 흔한 선택자 하나에 검사가 빨개지면
 *    고치는 사람이 이름 대장에 가짜 이름을 적어 대장을 오염시킨다. */
const falseAlarm = auditCss(rawCss.replace(/\n\.tbl \{/, '\na[href$=".pdf"] { color: var(--accent); }\n.tbl {'), { wantRegistry: true });
ok("속성 선택자의 점(`a[href$=\".pdf\"]`)을 클래스로 안 읽는다",
   !falseAlarm.bad.some((b) => b.code === "C1" && /\.pdf/.test(b.why)),
   "`.pdf` 를 「대장에 없는 클래스」로 읽었다 — 거짓 실패다");

/* ── 2부 ── */
let deep = false;
if (chromePath) {
  console.log("\n■ 2부 — DB 의 **진짜 긴 글자**로 그려서 잰다");
  let real;
  try { real = await realStrings(); ok("DB 에서 진짜 이름·단원 라벨을 읽었다", real.units.length > 0 && real.studs.length > 0); }
  catch (e) { fail++; n++; console.log("   ❌ DB 를 못 읽었다 —", String(e.message).split("\n")[0]); real = null; }

  /* ⚠️ `if (real)` 만으로는 **빈 배열을 못 막는다.** 새로 만든 DB·이관 직후에
   *    `real.units[0].length` 가 날 TypeError 스택을 뱉고 죽었다(실측 497행).
   *    원장님이 봐야 하는 것은 Node 스택이 아니라 「DB 가 비었다」한 줄이다. */
  if (real && !(real.units.length && real.studs.length && real.books.length)) {
    fail++; n++;
    console.log(`   ❌ DB 에 단원·학생·교재가 없어 **진짜 글자로 못 쟀다** (단원 ${real.units.length} · 학생 ${real.studs.length} · 교재 ${real.books.length}) — 2부를 건너뛴다`);
    real = null;
  }

  if (real) {
    console.log(`        가장 긴 단원 라벨 ${real.units[0].length}자 · 교재 ${real.books[0]?.length ?? 0}자 · 이름 ${real.studs[0].length}자`);
    const dir = mkdtempSync(join(tmpdir(), "layout-sample-"));
    const sample = join(dir, "sample.html");
    writeFileSync(sample, sampleHtml(rawCss, real));

    const br = await openBrowser();
    deep = true;
    const KIND = { 1: "부모 밖으로 삐져나감", 2: "형제끼리 겹침", 3: "세로로 쌓인 글자", 4: "잘린 글자",
                   5: "화면 밖으로 나감", 6: "늘어난 단추", 7: "한글에 고정폭 글꼴", 8: "투명도로 흐리게", 9: "붙박이가 안 붙음" };
    const FONTS = `JSON.stringify([...document.querySelectorAll("input,select,textarea")].map(e=>parseFloat(getComputedStyle(e).fontSize)))`;
    try {
      for (const w of WIDTHS) {
        const coarse = COARSE.has(w);
        const [raw, ptr, fonts] = await onPage(br, "file://" + sample, w, coarse, [AUDIT, POINTER_PROBE, FONTS]);
        const hits = JSON.parse(raw);
        ok(`${w}px — 본보기 화면이 0건`, hits.length === 0, `${hits.length}건`);
        hits.slice(0, 8).forEach((h) => console.log(`        ${KIND[h.k]} · ${h.el} — ${h.why}`));

        /* ⚠️ 이 탭이 정말 우리가 시킨 기계인가.
         *    옛 판은 손가락 폭 셋을 먼저 돌고 PC 를 마지막에 돌았는데,
         *    터치 흉내가 안 꺼져서 **1400px 도 손가락으로 쟀다**(실측). 그래서
         *    「1400px 입력칸 14px 이상」이 실은 16px 를 재고 있었고 오류 103 을 못 잡았다. */
        const P = JSON.parse(ptr);
        ok(`${w}px — ${coarse ? "손가락 기계" : "PC"} 로 제대로 쟀다`, coarse ? P.coarse : P.fine && !P.coarse,
           `pointer:coarse=${P.coarse} · pointer:fine=${P.fine} · hover:none=${P.hoverNone} — **PC 라 적고 손가락으로 쟀다**`);

        // 입력칸이 정말 그 크기로 그려졌는가 — 규칙이 아니라 **그려진 결과**를 본다
        const sizes = JSON.parse(fonts);
        const need = coarse ? 16 : 14;
        ok(`${w}px — 입력칸 글씨가 ${need}px 이상 (${coarse ? "손가락 기계" : "PC"})`,
           sizes.length > 0 && sizes.every((s) => s >= need), `[${sizes.join(",")}]`);
      }

      /* ── 붙박이 표 머리가 **진짜 붙는가** ──────────────────────────────
       * ⚠️ 이 줄이 없어서 표 머리가 **한 번도 안 붙는** 채로 86건·실패 0 이 떴다.
       *    `.tblwrap{overflow-x:auto}` 한 줄이 세로까지 스크롤 상자로 만들었는데
       *    그 상자는 세로로 안 굴러, 머리가 오류 없이 그냥 흘러 나갔다.
       *    규칙을 읽지 말고 **상자를 굴려 보고** 잰다. */
      for (const w of WIDTHS.filter((x) => !COARSE.has(x) || x === 768)) {
        const [raw] = await onPage(br, "file://" + sample, w, COARSE.has(w), [STICKY_PROBE]);
        const s = JSON.parse(raw);
        if (s.why) { ok(`${w}px — 붙박이 표 머리가 진짜 붙는다`, false, s.why); continue; }
        ok(`${w}px — 붙박이 표 머리가 진짜 붙는다`, s.moved >= 300 && Math.abs(s.t1 - s.t0) <= 2,
           `표 상자가 ${s.moved}px 굴렀는데 머리는 ${s.t0} → ${s.t1} (position:${s.pos}) — 화면 위로 사라진다`);
      }

      /* ── 고른 배색이 **기계 배색에 안 흔들리는가** ─────────────────────
       * ⚠️ 어두운 팔레트가 두 벌이고 미디어 쪽이 특정도로 이겨서, 딥네이비를 고쳐도
       *    다크 맥(원장님 기계)에서는 옛 값이 그대로였다 — 「고쳤다고 말할 뻔했다」.
       *    밝은 기계·어두운 기계에서 각각 읽어 **같은지**를 본다. */
      for (const skin of ["deep", "warm", "paper", "bright"]) {
        const read = async (scheme) => {
          const p = await br.newPage();
          try {
            await p.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
            await p.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
            await p.send("Page.navigate", { url: "file://" + sample });
            await new Promise((r) => setTimeout(r, 300));
            const res = await p.send("Runtime.evaluate", { expression: SKIN_PROBE(skin), returnByValue: true });
            return res.result.result.value;
          } finally { await p.close(); }
        };
        const [l, d] = [await read("light"), await read("dark")];
        const a = JSON.parse(l), b = JSON.parse(d);
        const diff = Object.keys(a).filter((k) => a[k] !== b[k]);
        ok(`배색 「${skin}」 이 기계 배색에 안 흔들린다`, diff.length === 0,
           diff.map((k) => `${k}: 밝은 기계 ${a[k]} ≠ 어두운 기계 ${b[k]}`).join(" · ") + " — **한쪽만 고쳐도 원장님 화면은 안 바뀐다**");
      }

      /* ⚠️ 여기가 이 검사의 핵심이다 — 검사가 **일부러 깨진 것을 잡는지**까지 본다 */
      console.log("\n■ 2부-b — 일부러 어기는 본보기를 **브라우저 검사가 잡는가**");
      const seen = new Set(), stickyWhy = [];
      for (const w of WIDTHS) {
        const [raw] = await onPage(br, "file://" + FIXTURE_URL(), w, COARSE.has(w), [AUDIT]);
        JSON.parse(raw).forEach((h) => { seen.add(h.k); if (h.k === 9) stickyWhy.push(h.el + " " + h.why); });
      }
      for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9])
        ok(`본보기의 「${KIND[k]}」을 잡았다`, seen.has(k), "**검사에 구멍이 있다 — 이걸 못 잡으면 화면이 깨져도 초록이 뜬다**");
      /* ⚠️ ⑨ 는 **두 모양** 다 잡아야 한다. hidden 만 잡던 옛 판이
       *    `.tblwrap{overflow-x:auto}` 로 표 머리가 한 번도 안 붙는 것을 통과시켰다. */
      ok("본보기의 「붙박이가 안 붙음」 중 **overflow:hidden 판**을 잡았다", stickyWhy.some((s) => /overflow-y:hidden/.test(s)));
      ok("본보기의 「붙박이가 안 붙음」 중 **가로 스크롤 상자(auto) 판**을 잡았다", stickyWhy.some((s) => /세로로 안 구른다/.test(s)),
         "`overflow-x:auto` 만 걸린 상자를 못 잡았다 — 표 머리가 조용히 안 붙는 그 자리다");
    } finally { br.close(); }
  }
} else {
  console.log("\n   ⚠️ 2부(진짜 브라우저)를 건너뛴다. 이 검사는 **얕다** — 화면을 그려 보지 않았다.");
  console.log("      크롬이나 크로미엄을 깔면 저절로 깊은 검사로 돈다.");
}

function FIXTURE_URL() { return process.cwd() + "/" + FIXTURE; }

/* ⚠️ **깊게 못 쟀으면 실패다.**
 * 전에는 크롬이 없으면 2부를 조용히 건너뛰고 `exit 0` 으로 끝났다. 그런데
 * `check-all.sh` 는 `if out=$(node "$f" 2>&1); then echo "✅"` 라 **통과한 검사의
 * 출력을 버린다** — 「얕은 검사만 돌았다」가 삼켜지고 화면에는 `✅ check-layout` 만 떴다.
 * CI·새 맥에서는 브라우저 검사 여섯이 통째로 안 돌았는데 원장님은 전부 초록으로 보셨다.
 * 거짓 초록은 검사가 없는 것보다 나쁘다. 그래서 여기서 **떨어진다.**
 * 정말 건너뛰어야 하는 기계에서는 사람이 일부러 `ALLOW_SHALLOW=1` 을 켠다. */
if (!deep && !ALLOW_SHALLOW) {
  fail++; n++;
  console.log("\n   ❌ **깊은 검사(진짜 브라우저)를 못 돌렸다 — 실패로 끝낸다.**");
  console.log(`      까닭: ${chromePath ? "본보기 화면을 못 그렸다 (위 ❌ 참고)" : "크롬·크로미엄·엣지를 못 찾았다"}`);
  console.log("      정말 얕게만 돌려야 하면 `ALLOW_SHALLOW=1 node scripts/check-layout.mjs`");
}

console.log(`\n■ 배색·레이아웃 검사 ${n}건 · 실패 ${fail}${deep ? "" : "   ⚠️ 얕은 검사만 돌았다" + (ALLOW_SHALLOW ? " (ALLOW_SHALLOW=1 로 봐줬다)" : "")}`);
process.exit(fail ? 1 : 0);
