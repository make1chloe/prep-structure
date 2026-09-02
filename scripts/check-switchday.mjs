/** 전환일 준비 검사 — **전환일에 손으로 돌릴 파일이 실제로 무언가를 하는가.**
 *  ⚠️ 9001(옛 public 개인정보 비우기)은 `v2.purge_map` 의 `public` 줄을 돈다.
 *     그 줄이 0개면 그 파일은 **아무것도 안 지우고** 「다 지웠습니다」처럼 끝난다.
 *     그러면 같은 아이의 이름·전화·상담 글이 옛 public 에 **영구히** 남는다. */
import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";

let fail = 0, n = 0, hold = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };
const gate = (t, c, why = "") => { n++; if (!c) { hold++; console.log(`   ⏸️  ${t}${why ? " — " + why : ""}`); }
                                   else console.log(`   ✅ ${t}`); };

console.log("■ 전환일에 손으로 돌릴 파일");
for (const f of ["9000_switch_day.sql", "9001_purge_public.sql"])
  ok(`${f} 가 있다`, existsSync(`supabase/migrations/${f}`));

const sw = readFileSync("supabase/migrations/9000_switch_day.sql", "utf8");
ok("PostgREST 노출에서 **public 을 안 뺀다** (빼면 구앱이 그 자리에서 죽는다)",
   !/db_schemas\s*=\s*'(?!.*public)/.test(sw) && /public/.test(sw));
ok("auth.users 트리거가 **안 던진다** (던지면 구앱의 계정 발급이 멈춘다)",
   /exception when others then/.test(sw));
// ⚠️ **주석은 빼고 본다** — 「되돌리기: drop trigger …」는 되돌리는 법을 적어 둔 것이지 실제 drop 이 아니다.
//    안 빼면 검사가 자기 주석을 읽고 헛되이 빨개진다 (내가 그렇게 짰다가 잡혔다)
const swCode = sw.split("\n").filter(l => !/^\s*--/.test(l)).join("\n");
ok("옛 public 트리거를 안 끈다 (되돌릴 때 필요하다)", !/drop\s+trigger[\s\S]{0,60}auth\.users/i.test(swCode));

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
for (let i = 1; ; i++) { try { await c.connect(); break; }
  catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 3000)); } }

console.log("\n■ D+30 파기가 실제로 무언가를 지우는가");
const pub = (await c.query("select count(*)::int n from v2.purge_map where schema_name='public'")).rows[0].n;
gate("파기 목록에 `public` 줄이 있다 — 없으면 9001 이 **한 줄도 안 지운다**",
     pub > 0, `지금 ${pub}줄. 옛 앱에 이름·전화가 남는 표·칸을 v2.purge_map 에 채워야 한다`);

console.log("\n■ 옛 public 에 사람 정보가 든 칸 중 **파기 목록에 없는 것**");
// ⚠️ 「짐작」으로 늘어놓지 않는다 — 진짜로 값이 든 칸만 세고, 목록과 대조한다.
//    사람 정보가 아닌 것(교재·단원·학교·반·문구 이름)은 여기서 뺀다 — 다 넣으면
//    옛 앱이 통계 화면조차 못 되고 통째로 못 읽게 된다.
const NOT_PERSON = new Set([
  "textbook_units.name", "textbooks.name", "homework_items.name", "schools.name",
  "classes.name", "message_templates.name", "message_templates.body",
  "todo_categories.name", "todo_routines.title", "prep_material_types.name",
  "exam_periods.name", "exam_periods.neis_name", "exam_periods.note",
  "holidays.name", "daily_reports.phone_in", "arrival_checks.phone_at",
  "schools.atpt_name",      // 교육청 이름 — 사람이 아니다
  "unit_exams.name",        // 단원평가 이름(문법 분류) — 사람이 아니다
]);
const RE = /name|phone|body|note|comment|reason|title|memo/i;
const cand = (await c.query(`
  select table_name t, column_name col from information_schema.columns
   where table_schema='public' and data_type in ('text','character varying')
     and table_name not like '%_backup' order by 1,2`)).rows.filter(x => RE.test(x.col));
const inMap = new Set((await c.query(
  "select tbl||'.'||col k from v2.purge_map where schema_name='public'")).rows.map(r => r.k));
const missing = [];
for (const x of cand) {
  const k = `${x.t}.${x.col}`;
  if (inMap.has(k) || NOT_PERSON.has(k)) continue;
  try {
    const r = (await c.query(`select count(*)::int n from public."${x.t}" where "${x.col}" is not null and "${x.col}" <> ''`)).rows[0].n;
    if (r > 0) missing.push(`${k} (${r}줄)`);
  } catch {}
}
gate("사람 정보가 든 칸이 **전부 파기 목록에 있다**", missing.length === 0,
     missing.join(" · ") || "");
console.log(`   (목록에 든 public 줄 ${inMap.size}개 · 사람 정보가 아니라 일부러 뺀 것 ${NOT_PERSON.size}개)`);

await c.end();
console.log(`\n■ 전환일 준비 검사 ${n}건 · 실패 ${fail} · 아직 안 된 것 ${hold}`);
process.exit(fail ? 1 : 0);
