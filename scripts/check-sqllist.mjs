/**
 * **새로 만든 SQL 이 점검 목록에 들어갔나** (2026-08-07)
 *
 * 원장님 — 「109 안 떠」
 *
 * SQL 을 새로 만들면 두 가지를 같이 해야 한다 —
 *   1. supabase/migrations/ 에 파일
 *   2. app/settings/sql/status.js 에 한 줄 (「지금 DB 상태」 가 이걸 본다)
 *
 * 2번을 빠뜨려도 **아무 오류가 안 난다.** SQL 은 「전체 복사」 안에 들어
 * 있으니 붙여넣으면 돌긴 하는데, 화면에는 「90/90 다 됐습니다」 라고 뜬다.
 * 그래서 원장님은 다 된 줄 알고 넘어가시고, 그 기능만 조용히 안 된다.
 *
 * 쓰는 법:  node scripts/check-sqllist.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

let bad = 0;

const files = readdirSync("supabase/migrations")
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();
const status = readFileSync("app/settings/sql/status.js", "utf8");

/**
 * **전부를 요구하지는 않는다.** 옛 파일 중에는 표를 안 만들고 규칙만 고친
 * 것도 있어서, 밖에서 물어볼 수 있는 자국이 없다. 그런 것은 목록에 못 넣는다.
 *
 * 대신 **자국을 남긴 파일**은 반드시 목록에 있어야 한다 —
 * `..._on()` 같은 표시 함수를 일부러 만들어 둔 파일이 그것이다.
 */
const missing = [];
const marks = new Map();   // 표식 이름 → 그것을 만든 파일들

for (const f of files) {
  const body = readFileSync(`supabase/migrations/${f}`, "utf8");
  const m = body.match(/create or replace function public\.(\w+_on)\(\)/);
  if (!m) continue;
  if (!marks.has(m[1])) marks.set(m[1], []);
  marks.get(m[1]).push(f);
}

/**
 * **같은 표식을 뒤에서 덮어쓰면 앞엣것은 못 센다.**
 *
 * 0091 과 0092 가 그렇다 — 둘 다 `task_audience_on()` 을 만든다. 표식은
 * 하나뿐이라 「0091 이 돌았나」 를 따로 물어볼 방법이 없다. 그래서 마지막
 * 파일만 목록에 있으면 된다. (실제로 status.js 에 그렇게 적혀 있다)
 */
for (const [name, owners] of marks) {
  const last = owners[owners.length - 1];
  const id = last.slice(0, 4);
  if (!status.includes(`"${id}"`)) missing.push(`${last} (자국: ${name})`);
}

if (missing.length) {
  console.log("  ✗ 점검 목록(app/settings/sql/status.js)에 없는 SQL:");
  missing.forEach((m) => console.log(`     ${m}`));
  console.log("     → 없으면 화면이 「다 됐습니다」 라고 말합니다. 한 줄씩 넣어주세요.");
  bad = 1;
}

/** 제일 마지막 SQL 은 반드시 목록에 있어야 한다 (방금 만든 것이 그것이다) */
const last = files[files.length - 1];
if (last && !status.includes(`"${last.slice(0, 4)}"`)) {
  console.log(`  ✗ 마지막 SQL ${last} 이 점검 목록에 없습니다`);
  bad = 1;
}

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log(`\n✅ SQL ${files.length}개 · 점검 목록에 빠진 것 없음`);
