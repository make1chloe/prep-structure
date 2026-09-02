import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false} }); await c.connect();

const t = (await c.query(`
  select c.relname tbl, obj_description(c.oid) note,
         (select count(*) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) cols,
         (select count(*) from pg_policies p where p.schemaname='v2' and p.tablename=c.relname) pol,
         (select array_agg(a.attname order by k.ord)
            from pg_index i join lateral unnest(i.indkey) with ordinality k(att,ord) on true
            join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.att
           where i.indrelid=c.oid and i.indisprimary) pk
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='v2' and c.relkind='r' order by c.relname`)).rows;
await c.end();

const noNote = t.filter(x => !x.note);
// ⚠️ 줄 수(n_live_tup)는 **통계**라 돌릴 때마다 달라진다 — 문서에 넣으면 검사가 헛되이 깨진다
const out = `# 표 유도 — v2 의 표 ${t.length}개가 어디서 나왔나

> ⚠️ **이 문서가 자동 검사의 근거다** (계획 자동 검사 ⑳).
> 마이그레이션이 만드는 표 이름이 여기 없으면 \`scripts/check-tables.mjs\` 가 깨진다.
> 표를 하나 더 세우려면 **동선의 어느 걸음에서 나왔는지를 먼저 적어야** 한다.
>
> 「한 줄이 무엇인가」는 표의 주석(\`comment on table\`)에서 그대로 가져온다 —
> 문서와 DB 가 두 벌이 되지 않게 (원칙 1). 고칠 때는 **마이그레이션의 주석을 고치고**
> \`node scripts/build-doc.mjs\` 를 다시 돌린다.

| 표 | 한 줄이 무엇인가 | 열쇠 | 칸 | 규칙 |
|---|---|---|---|---|
${t.map(x => `| \`${x.tbl}\` | ${(x.note || "⚠️ **안 적혔다**").replace(/\|/g,"\\|").replace(/\n/g," ").slice(0,150)} | ${(Array.isArray(x.pk) ? x.pk.join(" + ") : String(x.pk ?? "").replace(/[{}]/g,"").split(",").join(" + ")) || "—"} | ${x.cols} | ${x.pol} |`).join("\n")}

## ⚠️ 「한 줄이 무엇인가」가 안 적힌 표 ${noNote.length}개

계획 0단계 1번 — **표마다 「무엇이 한 줄인가」를 한 문장으로.** 그 문장이 곧 열쇠가 되게 한다.
안 적으면 습관적으로 번호를 붙이게 되고, 언젠가 「같은 아이 같은 날짜가 두 줄」이 들어온다.

${noNote.length ? noNote.map(x => `- \`${x.tbl}\``).join("\n") : "**없다.**"}

## 규칙이 하나도 없는 표

접근 규칙(RLS)이 0개면 **아무도 못 본다.** 켜 놓고 정책을 안 쓰면 그렇게 된다.

${t.filter(x => x.pol === 0).map(x => `- \`${x.tbl}\``).join("\n") || "**없다.**"}
`;
writeFileSync("docs/표-유도.md", out);
console.log(`표 ${t.length}개 · 한 줄 설명 없는 것 ${noNote.length}개 · 규칙 0개인 표 ${t.filter(x=>x.pol===0).length}개`);
