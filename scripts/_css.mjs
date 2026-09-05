/** CSS 를 글자 그대로 자른다 — 주석·@media 를 보존한 채. mockup-css(갈라내기)·check-mockup(토큰 대조)·check-palette(배색)가 같이 쓴다. */
export function parse(css, i = 0, end = css.length) {
  const items = [];
  while (i < end) {
    if (/\s/.test(css[i])) { i++; continue; }
    if (css.startsWith("/*", i)) { const j = css.indexOf("*/", i) + 2; items.push({ type: "comment", raw: css.slice(i, j) }); i = j; continue; }
    const open = css.indexOf("{", i); if (open < 0 || open >= end) break;
    const head = css.slice(i, open).trim();
    let d = 0, j = open; do { if (css[j] === "{") d++; else if (css[j] === "}") d--; j++; } while (d > 0 && j < end);
    const raw = css.slice(i, j);
    if (head.startsWith("@")) items.push({ type: "at", head: head.replace(/\s+/g, " "), raw, children: parse(css, open + 1, j - 1) });
    else items.push({ type: "rule", selector: head.replace(/\s+/g, " "), raw });
    i = j;
  }
  return items;
}
/** 토큰(--이름) 만 뽑는다. 열쇠 = "@media 조건§셀렉터" (media 없으면 "§셀렉터"). 같은 열쇠는 뒤가 앞을 덮는다(캐스케이드 순서). */
export function tokens(css) {
  const map = new Map();
  (function walk(items, media) {
    for (const it of items) {
      if (it.type === "at") { if (it.head.startsWith("@media")) walk(it.children, it.head); continue; }
      if (it.type !== "rule") continue;
      const body = it.raw.slice(it.raw.indexOf("{") + 1, it.raw.lastIndexOf("}")).replace(/\/\*[\s\S]*?\*\//g, "");
      const decls = body.split(";").map(s => s.trim()).filter(s => s.startsWith("--"));
      if (!decls.length) continue;
      const key = (media || "") + "§" + it.selector;
      const o = map.get(key) || {};
      for (const d of decls) { const k = d.indexOf(":"); o[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
      map.set(key, o);
    }
  })(parse(css), "");
  return map;
}
/** 색 도구 — 대비(WCAG) · HSL */
export function rgb(hex) { const m = String(hex).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let h = m[1]; if (h.length === 3) h = [...h].map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
export function contrast(a, b) { const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); }; const [x, y] = [L(a), L(b)]; return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function hsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; if (!d) return [0, 0, l]; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, d / (1 - Math.abs(2 * l - 1)), l]; }
/** 갈색 — 따뜻한 색상(20°~75°)이 중간 밝기(18%~50%)에 채도까지 있으면 겨자·카키·똥색이다(확정-㊽) */
export const isBrown = c => { const [h, s, l] = hsl(c); return h >= 20 && h <= 75 && l > .18 && l < .5 && s > .35; };
