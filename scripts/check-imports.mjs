// 없는 함수를 불러다 쓰는 곳을 찾는다.
//
// `next build` 는 이걸 못 잡는다. import 한 이름이 그 파일에 없으면 값이
// undefined 가 될 뿐이고, 빌드는 멀쩡히 통과한다. 터지는 건 사용자가
// 그 버튼을 눌렀을 때다 — 재원생 화면의 「교재 배정」이 실제로 그랬다.
// setStudentTextbooks 를 부르는데 그런 함수가 없었다.
//
// 쓰는 법:  node scripts/check-imports.mjs

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const DIRS = ["app", "lib", "components"];
const EXTS = [".js", ".jsx", ".mjs", ".ts", ".tsx"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** "@/app/x/y" · "./y" · "../y" 를 실제 파일로 */
function resolveLocal(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // 패키지는 안 본다
  for (const e of ["", ...EXTS]) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  for (const e of EXTS) {
    const p = join(base, "index" + e);
    if (existsSync(p)) return p;
  }
  return null;
}

/** 그 파일이 내보내는 이름들. `export *` 가 있으면 검사를 포기한다 */
function exportsOf(file, seen = new Set()) {
  if (seen.has(file)) return null;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  const names = new Set();

  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+default\b/gm)) names.add("default");
  // export { a, b as c }  ·  export { x } from "./y"
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  if (/^export\s+\*/m.test(src)) return null; // 어디까지 퍼지는지 모른다 — 넘어간다
  return names;
}

const problems = [];
const files = DIRS.filter((d) => existsSync(join(ROOT, d))).flatMap((d) => walk(join(ROOT, d)));

for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm)) {
    const target = resolveLocal(m[2], file);
    if (!target) continue;
    const has = exportsOf(target);
    if (!has) continue;
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (!t || t.startsWith("type ")) continue;
      const name = t.split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!has.has(name)) {
        problems.push(
          `  ${file.replace(ROOT + "/", "")} → ${m[2]} 에 '${name}' 가 없습니다`
        );
      }
    }
  }
}

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("  없음");
