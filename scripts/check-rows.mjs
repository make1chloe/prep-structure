/** 저장·삭제 줄 수 검사(검사-⑪ · 검사-73 · (바) 2026-09-08) — lib 의 쓰기 자리(update·delete·upsert)마다 「몇 줄 바뀌었나」를 본다: changed()(lib/sqlError.js 한 곳)를 지나거나 · .single() 이거나 · 제 손으로 줄 수를 보거나(3줄 안에 length·count 와 throw) · 「0줄 허용」 표시가 있어야 한다.
 *  changed 는 한 곳 · zero:"ok"(훑는 손)는 콕 집은 손(.eq("id") 꼴)에 못 붙는다. 주석은 표시(0줄 허용)를 먼저 읽고 지운다(폰-5) */
import { readFileSync, readdirSync } from "node:fs";
const MARK = "0줄 허용";
const stripLine = (l) => l.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/, "$1");
const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const files = readdirSync("lib").filter((f) => f.endsWith(".js"));
const miss = [], strictZero = [], usesChanged = new Set(), noImport = []; let sites = 0, viaChanged = 0, zeroOk = 0, marked = 0, own = 0, single = 0;
for (const f of files) {
  const p = "lib/" + f; const raw = readFileSync(p, "utf8").split("\n");
  const hasImport = /import \{[^}]*\bchanged\b[^}]*\} from "\.\/sqlError\.js"/.test(raw.join("\n"));
  for (let i = 0; i < raw.length; i++) {
    const rawLine = raw[i]; if (isComment(rawLine)) continue;
    const l = stripLine(rawLine); if (!/\.(update|delete|upsert)\(/.test(l) || !/db\(/.test(l)) continue;
    sites++;
    const win = raw.slice(i, i + 4).map(stripLine).join("\n");
    const hasMark = raw.slice(i, i + 4).some((x) => x.includes(MARK));
    if (/\bchanged\(/.test(l)) { viaChanged++; usesChanged.add(p); if (/zero:\s*"ok"/.test(l)) { zeroOk++; if (/\.eq\("id",/.test(l) && !/\.(in|is|or|neq|lt|gt|not)\(/.test(l) && !/ignoreDuplicates/.test(l) && !hasMark) strictZero.push(`${p}:${i + 1}`); } continue; }
    if (/\.single\(\)/.test(l)) { single++; continue; }
    if (hasMark) { marked++; continue; }
    if (/\bchanged\(await q\b/.test(win) || (/\b(length|count)\b/.test(win) && /\bthrow\b/.test(win))) { own++; continue; }
    miss.push(`${p}:${i + 1}: ${l.trim().slice(0, 110)}`);
  }
  if (usesChanged.has(p) && !hasImport) noImport.push(p);
}
console.log(`■ 저장·삭제 줄 수(검사-⑪) — 쓰기 자리 ${sites} · changed ${viaChanged}(0줄 허용 ${zeroOk}) · .single ${single} · 제 손 ${own} · 표시 ${marked}`);
ok("lib 의 쓰기 자리 전부가 줄 수를 본다(changed · single · 제 손 3줄 안 · 「0줄 허용」 표시)", miss.length === 0, `안 보는 곳 ${miss.length}: ` + miss.slice(0, 6).join(" | "));
ok("changed 는 lib/sqlError.js 한 곳", (() => { const defs = files.filter((f) => /export function changed\(/.test(readFileSync("lib/" + f, "utf8"))); return defs.length === 1 && defs[0] === "sqlError.js"; })());
ok("changed 를 쓰는 파일마다 import 가 있다", noImport.length === 0, noImport.join(", "));
ok("콕 집은 손(.eq(\"id\") 만)에 zero:\"ok\" 가 없다 — 그 자리는 0줄이면 실패", strictZero.length === 0, strictZero.join(", "));
ok("changed 를 import 한 파일에 같은 이름의 지역 변수가 없다(가리면 「t is not a function」 — 게이트 70 이 교재 시트 저장·진도에서 잡음)", (() => { const bad = files.filter((f) => { const s = readFileSync("lib/" + f, "utf8"); return /import \{[^}]*\bchanged\b[^}]*\} from "\.\/sqlError\.js"/.test(s) && /\b(let|const|var)\s+[^;=]*\bchanged\s*=|[,(]\s*changed\s*=\s*[^=>]|\bchanged\s*(\+\+|\+=)/.test(s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1")); }); return bad.length === 0 ? true : (console.log("      " + bad.join(", ")), false); })());
ok("row/rows 도우미 정의는 lib/sqlError.js 하나(원칙-1 — (사) 파일마다 22벌이던 것)", (() => { const dup = files.filter((f) => f !== "sqlError.js" && /^const rows? = \(r, what\) =>/m.test(readFileSync("lib/" + f, "utf8"))); return dup.length === 0 ? true : (console.log("      " + dup.join(", ")), false); })());
ok("changed 가 오류·0줄을 던진다(순수)", await (async () => { const { changed, ZERO } = await import("../lib/sqlError.js");
  const t = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
  return t(() => changed({ error: { message: "x" } }, "저장")) === "저장: x" && t(() => changed({ data: [], error: null }, "저장")) === `저장: ${ZERO}` && t(() => changed({ data: null, count: 0 }, "저장")) === `저장: ${ZERO}` && t(() => changed({ data: [], error: null }, "저장", { zero: "ok" })) === null && changed({ data: [{ id: 1 }] }, "저장").length === 1 && changed({ data: null, count: 2 }, "저장") === null && changed({ data: { id: 1 } }, "저장").id === 1; })());
console.log(`\n■ 저장·삭제 줄 수 검사 ${n}건 · 실패 ${bad}`); process.exit(bad ? 1 : 0);
