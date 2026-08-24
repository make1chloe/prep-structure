import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * **한 번에 넣는 줄들은 칸이 같아야 한다** (2026-08-24).
 *
 * 원장님 폰에서 「임시저장」 이 이렇게 터졌다:
 *   null value in column "carry_next" ... violates not-null constraint
 *
 * 여러 종류의 줄을 한 배열에 담아 `.insert()` 하면, 어떤 줄에만 있는 칸이
 * 다른 줄에서는 **NULL 로 채워진다**(칸의 기본값이 아니다). `not null` 칸이면
 * 통째로 거절이다. 게다가 두 종류가 **동시에** 있을 때만 터져서 조용히 숨는다.
 *
 * 그래서: 여러 갈래(`...`)를 이어붙여 만든 줄 배열을 그대로 넣지 못하게 막고,
 * `evenRows()`(lib/rows.js)로 칸을 맞춰서 넣게 한다.
 */
const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if ([".git", ".next", "node_modules"].includes(e.name)) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|jsx|mjs)$/.test(e.name)) files.push(p);
  }
})("app");
for (const d of ["lib", "components"]) {
  (function walk(x) {
    for (const e of readdirSync(x, { withFileTypes: true })) {
      const p = join(x, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs)$/.test(e.name)) files.push(p);
    }
  })(d);
}

const bad = [];
for (const f of files) {
  const s = readFileSync(f, "utf8");
  // .insert(어떤변수) 로 넘기는 이름들
  const names = new Set([...s.matchAll(/\.insert\(\s*([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]));
  for (const n of names) {
    const re = new RegExp(`(?:const|let)\\s+${n}\\s*=\\s*\\[`, "g");
    let m;
    while ((m = re.exec(s))) {
      let i = m.index + m[0].length;
      let depth = 1;
      while (i < s.length && depth > 0) {
        const c = s[i];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        i++;
      }
      const body = s.slice(m.index, i);
      const branches = (body.match(/\.\.\./g) || []).length;
      if (branches < 2) continue;                       // 한 갈래면 줄 모양이 같다
      if (/evenRows\s*\(/.test(s)) continue;            // 칸을 맞춰서 넣고 있다
      const line = s.slice(0, m.index).split("\n").length;
      bad.push(
        `${f}:${line} — 「${n}」 은 ${branches}갈래를 이어붙여 만든 줄 배열입니다. ` +
        `그대로 .insert() 하면 한쪽에만 있는 칸이 다른 줄에서 NULL 이 됩니다. ` +
        `evenRows(${n}, { 그칸: 기본값 }) 를 거쳐 넣으세요 (lib/rows.js)`
      );
    }
  }
}

if (bad.length) {
  console.log("❌ 줄 모양이 안 맞는 한꺼번에 넣기:");
  bad.forEach((b) => console.log("   ·", b));
  process.exit(1);
}
console.log("✅ 한꺼번에 넣는 줄들의 칸이 맞습니다");
