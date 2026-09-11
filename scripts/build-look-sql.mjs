/** 「실 DB 가 어디까지 왔나」 읽기용 SQL 을 만든다(docs/sql-paste/0-어디까지-들어갔나.sql).
 *  손으로 적어 두었더니 0159 에서 멈춘 채 낡았다(2026-09-11) — 이제 supabase/migrations 를 훑어서 짓는다.
 *  ⚠️ Supabase SQL Editor 는 **맨 마지막 select 하나만** 보여 주므로 한 문장이어야 한다.
 *  쓰기: node scripts/build-look-sql.mjs        (--check 면 짓지 않고 파일이 지금 것과 같은지만 본다) */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
export const OUT = "docs/sql-paste/0-어디까지-들어갔나.sql";
export function build() {
  const files = readdirSync("supabase/migrations").filter((f) => /^01\d\d_.*\.sql$/.test(f)).sort();
  const rows = files.map((f) => `    ('${f}')`).join(",\n");
  return `-- 클로이영어 — **읽기만 합니다.** 아무것도 안 바꾸고, 아무것도 안 지웁니다.
-- Supabase → SQL Editor → New query → 통째로 붙여넣고 Run → 나온 **한 줄**을 주세요.
--
-- 무엇을 보나: ① 앱 코드의 01xx ${files.length}개가 실 DB 에 다 들어갔나(안 들어간 번호를 댑니다)
--              ② 첫 주를 시작할 준비가 됐나 — 재원생 · 반 · 교재 · 정한 권한칸 · 연동 열쇠 · 앱이 낸 계정
-- ⚠️ SQL Editor 는 **맨 마지막 select 하나만** 보여 줍니다 — 그래서 한 문장으로 만들었습니다.
-- ⚠️ 열쇠 값은 한 글자도 안 꺼냅니다 — 갈래 수만 셉니다.
-- 이 파일은 손으로 고치지 않습니다 — \`node scripts/build-look-sql.mjs\` 가 짓습니다(0159 에서 멈춘 채 낡았던 일, 2026-09-11).

with 코드에있는것(file) as (values
${rows}
), 안들어간 as (
  select c.file from 코드에있는것 c left join v2.migration m on m.file = c.file where m.file is null
)
select
  (select count(*) from 안들어간)                                         as "안 들어간 개수",
  (select string_agg(left(file, 4), ' ' order by file) from 안들어간)     as "안 들어간 번호",
  (select count(*) from v2.migration where file like '01%')               as "실 DB 01xx",
  (select count(*) from v2.students where state = 'active')               as "재원생",
  (select count(*) from v2.classes where state = 'active')                as "도는 반",
  (select count(*) from v2.books where state = 'active')                  as "교재",
  (select count(*) from v2.role_access)                                   as "정한 권한칸",
  (select count(*) from v2.integration)                                   as "연동 열쇠 갈래",
  (select count(*) from v2.profiles where issued_by_app)                  as "앱이 낸 계정";
`;
}
// 검사가 이 파일을 **가져다 쓰기만** 하도록, 짓는 것은 곧바로 돌렸을 때만 한다(검사는 절대 안 쓴다)
if (process.argv[1] && process.argv[1].endsWith("build-look-sql.mjs")) {
  const sql = build();
  if (process.argv.includes("--check")) {
    let now = ""; try { now = readFileSync(OUT, "utf8"); } catch {}
    if (now === sql) { console.log(`   ✅ ${OUT} 가 supabase/migrations 와 같다`); process.exit(0); }
    console.log(`   ❌ ${OUT} 가 낡았다 — node scripts/build-look-sql.mjs 로 다시 지으세요`); process.exit(1);
  }
  writeFileSync(OUT, sql);
  console.log(`■ ${OUT} 를 다시 지었습니다`);
}
