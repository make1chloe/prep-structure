/** 앱은 DB 보다 앞서지 않는다 — (어78) 사고가 남긴 파수꾼.
 *  2026-09-18 원장님 폰 사진: 「⚠️ 오늘 수업을 못 열었습니다 / 수업 일지를 못 읽음: column learn_items_2.by_app does not exist」.
 *  까닭: 앱은 푸시하면 **바로** 올라가고(Vercel), SQL 은 원장님이 **나중에** 손으로 붙이신다. 그 사이에 앱이 새 칸을 읽으면
 *  PostgREST 가 조회 **통째**를 거절해 화면이 죽는다. 그러니 새 칸은 「없어도 사는」 꼴로만 쓴다.
 *  들어간데까지 뒤의 칸을 **아직 실 DB 에 없다**고 치고 본다 — 원장님이 「넣었다」 하시면 숫자만 올린다(안 올려도 검사가 느슨해지지 않는 쪽이라 안전하다). */
import { readFileSync, readdirSync, existsSync } from "node:fs";

/** 원장님이 붙이신 것이 확인된 마지막 번호. 이 뒤는 실 DB 에 아직 없다고 친다.
 *  2026-09-18 원장님: 「177까지완료 178안열림」 → 0177 까지 들어갔다(0178 은 아직). */
const 들어간데까지 = 177;

const read = (p) => readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? "\n        " + why : ""}`); } };

const migs = readdirSync("supabase/migrations").filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const num = (f) => Number(f.slice(0, 4));
const 안들어간 = migs.filter((f) => num(f) > 들어간데까지);

/** 아직 안 들어간 마이그레이션이 더하는 칸 — [칸이름, 어느 파일] */
const 새칸 = [];
for (const f of 안들어간) {
  for (const m of read(`supabase/migrations/${f}`).matchAll(/alter table\s+v2\.(\w+)\s+add column(?:\s+if not exists)?\s+(\w+)/gi)) 새칸.push({ col: m[2], table: m[1], file: f });
}

/** 앱 글 — lib 과 app 만 본다(검사·걷기·SQL 은 e2e DB 를 쓰니 새 칸을 알아도 된다) */
const srcs = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p); else if (e.name.endsWith(".js")) srcs.push({ p, s: strip(read(p)) });
  }
})("lib");
walk2("app");
function walk2(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk2(p); else if (e.name.endsWith(".js")) srcs.push({ p, s: strip(read(p)) });
  }
}

console.log(`■ 앱은 DB 보다 앞서지 않는다 — 0${들어간데까지} 까지 들어간 것으로 치고, 그 뒤 ${안들어간.length}개가 더한 칸 ${새칸.length}개를 본다`);
console.log(`   (새 칸: ${새칸.map((c) => `${c.table}.${c.col}`).join(" · ") || "없음"})`);

/** ① 읽는 자리 — 새 칸 이름이 **글자(문자열)** 로 나오면 그 조회가 통째로 죽는다(select · eq · order · onConflict 다 같다) */
const 글자 = [];
for (const { p, s } of srcs) {
  for (const m of s.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)) {
    const hit = 새칸.find((c) => new RegExp(`\\b${c.col}\\b`).test(m[0]));
    if (hit) 글자.push(`${p} · ${hit.col} · ${m[0].slice(0, 60)}`);
  }
}
ok("새 칸 이름이 조회·거르기 글자에 안 나온다 — 나오면 그 화면이 **통째로** 죽는다((어78) 사고: 오늘 수업이 안 열렸다)",
  글자.length === 0, 글자.join("\n        "));

/** ② 유일 짝 — onConflict 는 짝의 칸 이름을 코드가 외우는 것이라, 짝에 칸이 하나 늘면 앱이 먼저 깨진다 */
const 짝 = [];
for (const { p, s } of srcs) for (const m of s.matchAll(/onConflict:\s*"([^"]*)"/g)) {
  const hit = 새칸.find((c) => new RegExp(`\\b${c.col}\\b`).test(m[1]));
  if (hit) 짝.push(`${p} · ${hit.col} · onConflict "${m[1]}"`);
}
for (const { p, s } of srcs) for (const m of s.matchAll(/from\("file_link"\)\.upsert/g)) 짝.push(`${p} · file_link 에 upsert(onConflict) — 붙는 자리가 늘 때마다 깨진다`);
ok("유일 짝(onConflict)에 새 칸이 안 들고 · **붙이는 표(file_link)는 아예 안 쓴다** — 넣어 보고 「이미 있다」(23505)면 넘어가는 편이 어느 판의 DB 에서도 산다(lib/files.js linkOnce 한 벌)",
  짝.length === 0, 짝.join("\n        "));

/** ③ 걸렸을 때 화면이 **무엇을 하실지** 말한다 — 새 칸은 붙여넣기 번호를 아는 자리(COL_PASTE)에 올라 있어야 한다.
 *  (어78) 사고 때 원장님이 보신 것은 「column learn_items_2.by_app does not exist」 한 줄뿐이었다(대전제-0 · (어49) 와 같은 일). */
const colPaste = read("lib/sqlError.js");
const 안올린 = 새칸.filter((c) => !new RegExp(`\\b${c.col}:\\s*"`).test(colPaste));
ok("새 칸이 전부 COL_PASTE(lib/sqlError.js)에 올라 있다 — 걸리면 화면이 「docs/sql-paste/NNNN.sql 을 아직 안 넣으셨습니다」라고 말한다",
  안올린.length === 0, 안올린.map((c) => `${c.col} → ${c.file.slice(0, 4)}`).join(" · "));

/** ④ 쓰는 자리 — 새 칸을 **여러 칸을 함께 저장하는 한 문장**에 실으면 그 저장이 통째로 터진다. 따로 적고, 칸이 없으면 넘어간다.
 *  (어77) 루틴 항목 만들기·고치기가 그랬다 — by_app 을 이름·하는 법과 한 문장에 실어서, 0177 전에는 항목을 못 만들 뻔했다. */
const routine = strip(read("lib/routine.js"));
const 섞인 = [...routine.matchAll(/\{[^{}]*by_app[^{}]*\}/g)].filter((m) => /(name|method|checks|state)\s*:/.test(m[0]));
ok("루틴 항목의 새 칸은 **따로** 적는다(setItemApp) — 이름·하는 법과 한 문장에 안 싣는다 · 칸이 없으면 조용히 넘어간다",
  /async function setItemApp/.test(routine) && /does not exist/i.test(routine)
  && 섞인.length === 0 && (routine.match(/await setItemApp\(/g) ?? []).length === 2,
  섞인.map((m) => m[0].slice(0, 70)).join(" · "));

/** ⑤ 원장님이 붙이실 것 — 붙여넣기 파일이 없으면 그 칸은 영영 안 들어간다(전환일 9000·9001 은 그날 따로 돌린다) */
const 헐거운 = (t) => t.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
const 빠진붙임 = 안들어간.filter((f) => num(f) < 9000).filter((f) => {
  const paste = `docs/sql-paste/${f.slice(0, 4)}.sql`;
  return !existsSync(paste) || !헐거운(read(paste)).includes(헐거운(read(`supabase/migrations/${f}`)));
});
ok("안 들어간 01xx 마다 붙여넣기 파일(docs/sql-paste/NNNN.sql)이 있고 **본문을 그대로** 담고 있다",
  빠진붙임.length === 0, 빠진붙임.join(" · "));

/** ⑥ 숫자를 잊지 않게 */
ok(`들어간데까지(0${들어간데까지})가 실제 있는 번호다 — 원장님이 「넣었다」 하시면 이 숫자만 올린다`,
  migs.some((f) => num(f) === 들어간데까지));

console.log(`\n■ 앱은 DB 보다 앞서지 않는다 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
