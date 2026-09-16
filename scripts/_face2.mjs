import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : files(p)) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:\\])\/\/.*$/gm, (m, p1) => p1 + m.slice(p1.length).replace(/./g, " "));
const want = process.argv.slice(2);
function buttonsRanges(src){ const r=[]; let i=0; while((i=src.indexOf("<button",i))!==-1){ const e=src.indexOf("</button>",i); if(e===-1)break; r.push([i,e+9]); i+=7; } return r; }
for (const c of want) {
  console.log(`\n=== ${c} ===`);
  for (const p of [...files("app"), ...files("lib")]) {
    if (p === "lib/emoji.js") continue;
    const src = noComments(readFileSync(p, "utf8")); const br = buttonsRanges(src);
    let i = 0;
    while ((i = src.indexOf(c, i)) !== -1) {
      if (!br.some(([a, b]) => i >= a && i < b)) {
        const line = src.slice(src.lastIndexOf("\n", i) + 1, (src.indexOf("\n", i) + 1 || src.length + 1) - 1);
        console.log("  ", p, "|", line.trim().slice(Math.max(0, line.indexOf(c) - 50), line.indexOf(c) + 50).replace(/\s+/g, " "));
      }
      i += c.length;
    }
  }
}
