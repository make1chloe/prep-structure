/** 자동 검사 ⑳ — **표를 하나 더 세우려면 「무엇이 한 줄인가」를 먼저 적어야 한다.**
 *
 *  계획 0단계 1번: 그 문장이 곧 열쇠가 된다. 안 적으면 습관적으로 번호를 붙이게 되고,
 *  언젠가 「같은 아이 같은 날짜가 두 줄」이 들어온다.
 *
 *  ⚠️ 문서는 **DB 주석에서 만들어 낸다**(scripts/build-doc.mjs). 손으로 두 벌 적지 않는다(원칙 1).
 *     그래서 이 검사는 「문서에 있나」가 아니라 **「문서가 지금 DB 와 같나」**를 본다 —
 *     표를 더하고 문서를 안 다시 만들면 여기서 걸린다. */
import { Client } from "pg";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DOC = "docs/표-유도.md";
let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };

const url = (process.env.DATABASE_URL ?? readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
for (let i = 1; ; i++) { try { await c.connect(); break; }
  catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 3000)); } }

const rows = (await c.query(`
  select c.relname tbl, obj_description(c.oid) note
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('v2','v3') and c.relkind = 'r' order by n.nspname, c.relname`)).rows;
await c.end();

console.log(`■ v2·v3 의 표 ${rows.length}개`);
ok(`${DOC} 가 있다`, existsSync(DOC), "계획 1단계 6번 — 첫 마이그레이션보다 먼저 나왔어야 한다");
const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";

const missing = rows.filter(r => !new RegExp("`" + r.tbl + "`").test(doc)).map(r => r.tbl);
ok("문서에 없는 표가 없다 — 있으면 「어느 걸음에서 나왔나」를 안 적고 세운 것이다",
   missing.length === 0, missing.join(" "));

const noNote = rows.filter(r => !r.note || !String(r.note).trim()).map(r => r.tbl);
ok("「무엇이 한 줄인가」가 다 적혀 있다 (0단계 1번)", noNote.length === 0, noNote.join(" "));

// ⚠️ 문서를 다시 만들어 지금 파일과 견준다 — 안 그러면 표를 더하고 문서를 안 고쳐도 통과한다
let rebuilt = "";
try { execFileSync("node", ["scripts/build-doc.mjs"], { stdio: "pipe" });
      rebuilt = readFileSync(DOC, "utf8"); } catch (e) { rebuilt = ""; }
ok("문서가 지금 DB 와 같다 (안 같으면 `node scripts/build-doc.mjs` 를 다시 돌린다)",
   rebuilt !== "" && rebuilt === doc,
   rebuilt === "" ? "다시 만들다 터졌다" : "문서가 낡았다 — 방금 다시 만들었으니 커밋해라");

/* ══ 규칙 문서의 「지킴:」이 **진짜 검사 이름**인가 ═══════════════════════════
 * `docs/규칙.md` 가 스스로 요구한다 — 「규칙을 지키는 검사가 생기면 그 이름을 규칙 옆에 적는다」.
 * ⚠️ 적어만 두면 **이름이 썩는다** — 검사 파일 이름을 바꾸는 날 문서만 옛 이름을 들고 남는다.
 *    그러면 원장님은 「이건 지켜지고 있다」고 읽는데 그 검사는 없다(대전제-0).                */
{
  const rules = readFileSync("docs/규칙.md", "utf8");
  const 있는것 = new Set(readdirSync("scripts").filter((f) => /^check-.*\.mjs$/.test(f))
    .map((f) => f.replace(/\.mjs$/, "")));
  const 적힌것 = [...new Set([...rules.matchAll(/\*\*지킴:\*\* `([^`]+)`/g)]
    .flatMap((m) => m[1].split(" · ").map((x) => x.trim())))];
  const 없는 = 적힌것.filter((x) => !x.endsWith("*") && !있는것.has(x) && !existsSync("scripts/" + x + ".mjs"));   // e2e/screens 처럼 눌러보기 검사는 scripts/ 아래 경로로 적는다
  ok("규칙 문서의 「지킴:」이 **진짜 있는 검사 이름**이다", 없는.length === 0,
     `없는 이름: ${없는.join(" ")} — 검사 이름을 바꿨으면 docs/규칙.md 도 같이 고친다`);
  const 빈칸 = (rules.match(/\*\*지킴:\*\* —/g) ?? []).length;
  const 전체 = (rules.match(/\*\*지킴:\*\*/g) ?? []).length;
  ok(`규칙 ${전체}개 중 **지키는 검사가 없는 것 ${빈칸}개** — 여기가 다음에 어긋날 자리다`,
     전체 > 0, "「지킴:」이 한 줄도 없다 — 규칙 문서가 낡았다");
}

console.log(`\n■ 표 유도 검사 ${n}건 · 실패 ${fail}`);

process.exit(fail ? 1 : 0);
