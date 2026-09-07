/** 실 DB 에 붙여넣을 **한 벌**을 만든다 — `docs/개발자-인수인계.md` 3절 3번의 다른 길.
 *
 *  까닭: Claude Code 웹 세션은 **5432 로 못 붙는다**(2026-09-07 실측 — 나가는 길이
 *  전부 HTTP/HTTPS 프록시라 날 TCP 가 안 나간다 · 망 정책을 무엇으로 바꿔도 같다).
 *  그래서 `node scripts/_ap.mjs …` 를 못 돌리는 자리가 생긴다. 그럴 때 이 파일을
 *  Supabase → SQL Editor 에 붙여넣으면 **같은 SQL 이 같은 차례로** 돌고,
 *  `v2.migration` 기록까지 같이 들어가 `check-migrations` 가 초록으로 남는다.
 *
 *  ⚠️ 9xxx(전환일)은 **절대 안 담는다** — 그날 손으로 한 번 돌리는 파일이다.
 *
 *  쓰기: node scripts/build-real-db-sql.mjs              한 파일로 (0100~ 전부)
 *        node scripts/build-real-db-sql.mjs --조각 8      8개씩 나눠서 (편집기가 큰 것을 못 삼킬 때)
 *        node scripts/build-real-db-sql.mjs 0134_… 0135_…  골라서
 *
 *  조각으로 나눠도 안전한 까닭 — 조각마다 **제 트랜잭션**이고, 맨 앞 문지기가
 *  ① 이 조각이 이미 들어갔나 ② **앞 파일(0100~ 이 조각 앞까지 전부)이 다 들어갔나** 를 먼저 본다 —
 *  골라 만든 파일(0139 하나 등)도 같다. 그래서 차례를 건너뛰거나 두 번 돌리는 사고가 안 난다. */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { sha } from "./_sha.mjs";

const argv = process.argv.slice(2);
let 조각 = 0;
const i조각 = argv.findIndex(a => a === "--조각" || a === "--split");
if (i조각 >= 0) { 조각 = Number(argv[i조각 + 1]); argv.splice(i조각, 2);
  if (!Number.isInteger(조각) || 조각 < 1) { console.log("❌ --조각 뒤에는 1 이상의 수"); process.exit(1); } }

const all = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort();
const files = (argv.length ? argv : all.filter(f => /^01\d\d_/.test(f)));

const bad = files.filter(f => !all.includes(f));
if (bad.length) { console.log("❌ 없는 파일:", bad.join(" ")); process.exit(1); }
const sw = files.filter(f => /^9\d{3}_/.test(f));
if (sw.length) { console.log("❌ 전환일 파일은 못 담는다:", sw.join(" ")); process.exit(1); }
if (!files.length) { console.log("❌ 담을 것이 없다"); process.exit(1); }

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const 날 = new Date().toISOString().slice(0, 10);
const 폭 = (a) => `${a[0].slice(0, 4)}~${a[a.length - 1].slice(0, 4)}`;
const 온폭 = 폭(files);

/** 조각 하나(또는 통째 한 벌)의 SQL. 앞선 것(before)이 다 들어가 있어야 돈다. */
function 벌(몫, before, 번, 총) {
  const 이름 = 총 > 1 ? `${번}/${총} 조각 · ${폭(몫)}` : `${온폭} · ${몫.length}개`;
  const 머리 = [
`-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (${이름} · ${날} 만듦)`,
`--`,
`-- 어디서 왔나 : supabase/migrations/*.sql 을 **번호 차례대로** 이어 붙인 것이다.`,
`--               규칙은 docs/개발자-인수인계.md 3절 「실 DB 에 돌리는 법」.`,
`-- 어디에 넣나 : Supabase → SQL Editor → New query → 통째로 붙여넣고 Run.`,
...(총 > 1 ? [`-- ⚠️ 조각이 ${총}개다 — **1번부터 차례로** 돌린다. 건너뛰면 문지기가 막는다.`] : []),
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
`-- 시간제한을 이 트랜잭션 동안만 푼다 — 편집기 기본값(짧다)에 걸리면 통째로 되돌아간다.`,
`set local statement_timeout = 0;`,
`set local idle_in_transaction_session_timeout = 0;`,
`set local lock_timeout = 0;`,
``,
`-- 문지기 — ① 이미 들어갔나 ② 앞 조각이 다 들어갔나. 엉뚱한 오류 대신 사람 말로 멈춘다.`,
`do $guard$`,
`declare 든것 int; 앞것 int;`,
`begin`,
`  select count(*) into 든것 from v2.migration where file = any(array[${몫.map(q).join(", ")}]);`,
`  if 든것 = ${몫.length} then`,
`    raise exception '${이름} 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다.${총 > 1 ? " 다음 조각으로 넘어가세요." : " 이 창을 닫으셔도 됩니다."}';`,
`  end if;`,
...(before.length ? [
`  select count(*) into 앞것 from v2.migration where file = any(array[${before.map(q).join(", ")}]);`,
`  if 앞것 <> ${before.length} then`,
`    raise exception '앞 파일 ${before[0].slice(0, 4)}~${before[before.length - 1].slice(0, 4)} 이 아직 다 안 들어갔습니다 (${before.length}개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;`,
`  end if;`] : []),
`end`,
`$guard$;`,
``,
  ].join("\n");

  const 몸 = 몫.map((f, i) => [
    ``,
    `-- ─────────────────────────────────────────────────────────────`,
    `-- ${i + 1}/${몫.length} · ${f}`,
    `-- ─────────────────────────────────────────────────────────────`,
    readFileSync("supabase/migrations/" + f, "utf8").trimEnd(),
    ``,
    `insert into v2.migration(file, sha) values (${q(f)}, ${q(sha(f))})`,
    `  on conflict (file) do update set sha = excluded.sha, applied_at = now();`,
  ].join("\n")).join("\n");

  return 머리 + 몸 + "\n\ncommit;\n";
}

mkdirSync(".tmp", { recursive: true });
const 뭉치 = [];
if (조각) for (let i = 0; i < files.length; i += 조각) 뭉치.push(files.slice(i, i + 조각));
else 뭉치.push(files);

뭉치.forEach((몫, i) => {
  const before = all.filter(f => /^01\d\d_/.test(f) && f < 몫[0]);   // 이 조각 앞의 01xx **전부**(고른 파일 밖의 것도) — 0139 만 골라 만든 파일이 0100~ 없는 DB 에서 「v2.rule 이 없다」로 터졌다(2026-09-07 원장님 실측). 문지기가 사람 말로 막아야 한다
  const 자리 = 뭉치.length > 1
    ? `.tmp/실DB-마이그레이션-${온폭}-${i + 1}of${뭉치.length}.sql`
    : `.tmp/실DB-마이그레이션-${온폭}.sql`;
  writeFileSync(자리, 벌(몫, before, i + 1, 뭉치.length));
  const kb = (readFileSync(자리).length / 1024).toFixed(0);
  console.log(`■ ${몫.length}개 — ${자리} (${kb}KB)   ${몫[0]} … ${몫[몫.length - 1]}`);
});
