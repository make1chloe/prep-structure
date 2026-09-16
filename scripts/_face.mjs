import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : files(p)) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const PIC = /\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*/gu;
const strip = (c) => c.replace(/️/g, "");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:\\])\/\/.*$/gm, (m, p1) => p1 + m.slice(p1.length).replace(/./g, " "));
function buttonsRanges(src){ const r=[]; let i=0; while((i=src.indexOf("<button",i))!==-1){ const e=src.indexOf("</button>",i); if(e===-1)break; r.push([i,e+9]); i+=7; } return r; }
const map = new Map();
for (const p of [...files("app"), ...files("lib")]) {
  if (p === "lib/emoji.js") continue;
  const src = noComments(readFileSync(p, "utf8"));
  const br = buttonsRanges(src);
  for (const m of src.matchAll(PIC)) {
    const at = m.index; if (br.some(([a, b]) => at >= a && at < b)) continue;
    const c = strip(m[0]); if (!map.has(c)) map.set(c, []);
    const line = src.slice(src.lastIndexOf("\n", at) + 1, (src.indexOf("\n", at) + 1 || src.length + 1) - 1);
    map.get(c).push([p, line.trim().slice(Math.max(0, line.indexOf(m[0]) - 45), line.indexOf(m[0]) + 55).replace(/\s+/g, " ")]);
  }
}
const rows = [...map].sort((a, b) => b[1].length - a[1].length);
console.log("화면 얼굴 그림(주석·단추 밖)", rows.reduce((n, [, v]) => n + v.length, 0), "자리 ·", rows.length, "종");
for (const [c, v] of rows) console.log(`${c} ×${v.length}  ${[...new Set(v.map((x) => x[0]))].length}파일`);
console.log("\n=== 여러 파일에 걸친 것의 문맥 ===");
for (const [c, v] of rows.filter(([, v]) => v.length >= 6).slice(0, 14)) { console.log(`\n${c} ×${v.length}`); for (const [f, t] of v.slice(0, 5)) console.log("   ", f, "|", t); }
