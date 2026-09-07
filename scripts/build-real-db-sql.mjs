/** 실 DB 에 붙여넣을 **한 벌**을 만든다 — `docs/개발자-인수인계.md` 3절 3번의 다른 길.
 *
 *  까닭: Claude Code 웹 세션은 **5432 로 못 붙는다**(2026-09-07 실측 — 나가는 길이
 *  전부 HTTP/HTTPS 프록시라 날 TCP 가 안 나간다 · 망 정책을 무엇으로 바꿔도 같다).
 *  그래서 `node scripts/_ap.mjs …` 를 못 돌리는 자리가 생긴다. 그럴 때 이 파일 하나를
 *  Supabase → SQL Editor 에 붙여넣으면 **같은 SQL 이 같은 차례로** 돌고,
 *  `v2.migration` 기록까지 같이 들어가 `check-migrations` 가 초록으로 남는다.
 *
 *  ⚠️ 9xxx(전환일)은 **절대 안 담는다** — 그날 손으로 한 번 돌리는 파일이다.
 *  쓰기: node scripts/build-real-db-sql.mjs            (0100~ 새 앱이 더한 것 전부)
 *        node scripts/build-real-db-sql.mjs 0134_… 0135_…  (골라서) */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { sha } from "./_sha.mjs";

const all = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort();
const asked = process.argv.slice(2);
const files = (asked.length ? asked : all.filter(f => /^01\d\d_/.test(f)));

const bad = files.filter(f => !all.includes(f));
if (bad.length) { console.log("❌ 없는 파일:", bad.join(" ")); process.exit(1); }
const sw = files.filter(f => /^9\d{3}_/.test(f));
if (sw.length) { console.log("❌ 전환일 파일은 못 담는다:", sw.join(" ")); process.exit(1); }
if (!files.length) { console.log("❌ 담을 것이 없다"); process.exit(1); }

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const 날 = new Date().toISOString().slice(0, 10);
const 범위 = `${files[0].slice(0, 4)}~${files[files.length - 1].slice(0, 4)}`;
const 줄 = [
`-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 한 벌 (${범위} · ${files.length}개 · ${날} 만듦)`,
`--`,
`-- 어디서 왔나 : supabase/migrations/*.sql 을 **번호 차례대로** 이어 붙인 것이다.`,
`--               규칙은 docs/개발자-인수인계.md 3절 「실 DB 에 돌리는 법」.`,
`-- 어디에 넣나 : Supabase → SQL Editor → New query → 통째로 붙여넣고 Run.`,
`--`,
`-- ⚠️ v2 스키마만 건드린다 — public · auth · storage 는 한 줄도 안 건드린다(check-v2only 가 잰다).`,
`-- ⚠️ 전환일 파일(9000 · 9001)은 여기 **없다** — 그날 따로 돌린다.`,
`-- ⚠️ 통째로 **한 트랜잭션**이다 — 하나라도 틀리면 아무것도 안 들어간다.`,
`--     그래서 실패했으면 고치고 **그대로 다시** 붙여넣으면 된다(들어간 것이 없으니 처음과 같다).`,
`-- ⚠️ 반대로 **다 들어간 뒤에 또 돌리면** 0106·0114·0128 에서 멈춘다 — 뒤 파일(0108·0119·0129·0131)이`,
`--     같은 함수를 다른 반환형으로 다시 냈기 때문이다(2026-09-07 실측). 파일 하나하나는 멱등이지만`,
`--     **줄 전체를 처음부터 다시 도는 것**은 멱등이 아니다. 그럴 일이 없게 아래 문지기가 먼저 막는다.`,
``,
`begin;`,
``,
`-- 문지기 — 이미 다 들어가 있으면 여기서 멈춘다(엉뚱한 오류 대신 사람 말로).`,
`do $문지기$`,
`begin`,
`  if (select count(*) from v2.migration where file = any(array[${files.map(q).join(", ")}])) = ${files.length} then`,
`    raise exception '${범위} ${files.length}개가 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';`,
`  end if;`,
`end`,
`$문지기$;`,
``,
].join("\n");

const 몸 = files.map((f, i) => [
  ``,
  `-- ─────────────────────────────────────────────────────────────`,
  `-- ${i + 1}/${files.length} · ${f}`,
  `-- ─────────────────────────────────────────────────────────────`,
  readFileSync("supabase/migrations/" + f, "utf8").trimEnd(),
  ``,
  `insert into v2.migration(file, sha) values (${q(f)}, ${q(sha(f))})`,
  `  on conflict (file) do update set sha = excluded.sha, applied_at = now();`,
].join("\n")).join("\n");


mkdirSync(".tmp", { recursive: true });
const 자리 = `.tmp/실DB-마이그레이션-${범위}.sql`;
writeFileSync(자리, 줄 + 몸 + "\n\ncommit;\n");
const 크기 = readFileSync(자리).length;
console.log(`■ ${files.length}개를 한 벌로 — ${자리} (${(크기 / 1024).toFixed(0)}KB)`);
console.log(`   ${files[0]}  …  ${files[files.length - 1]}`);
