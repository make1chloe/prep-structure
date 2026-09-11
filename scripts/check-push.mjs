/** 처음-4 「알림 동의 — 언제 동의했나 / 언제 껐나」((사2) 2026-09-11 — 0단계에서 지웠던 옛 check-push 를 다시 세운다).
 *  동의는 **기록**이다. 켠 때(agreed_at)와 끈 때(revoked_at)가 남아야 「언제부터 보내도 되었나」를 나중에 댈 수 있다.
 *  그리고 끄기는 **지우는 것이 아니다**(대전제-6) — 줄을 지우면 「껐다」는 사실 자체가 사라진다.
 *  진짜 DB(칸·색인)와 코드(끄는 길) 둘 다 본다 — 하나만 보면 칸만 있고 안 쓰는 꼴을 못 잡는다. */
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const lib = Object.fromEntries(readdirSync("lib").filter((f) => f.endsWith(".js")).map((f) => [f, strip(readFileSync(`lib/${f}`, "utf8"))]));
const all = Object.values(lib).join("\n");

console.log("■ 처음-4 — 끄기는 지우지 않는다(대전제-6)");
ok("끈 기기는 **revoked_at 을 찍는다** — push_sub 을 지우는 손이 lib 에 없다", !/from\("push_sub"\)[\s\S]{0,80}\.delete\(/.test(all), (all.match(/from\("push_sub"\)[\s\S]{0,80}\.delete\(/) ?? [""])[0].slice(0, 80));
ok("보낼 기기를 고를 때 **끈 것은 뺀다**(revoked_at is null)", /from\("push_sub"\)[\s\S]{0,300}\.is\("revoked_at", null\)/.test(lib["notify.js"] ?? ""));
ok("404·410(기기가 알림을 끔)이면 그 자리에서 revoked_at 을 찍는다 — 다음 발송이 헛돌지 않는다", /gone/.test(lib["push.js"] ?? "") && /revoked_at: now/.test(lib["notify.js"] ?? ""));
ok("순수 셈에서도 끈 기기는 없는 것으로 센다(lib/notify-plan.js)", /revoked_at/.test(lib["notify-plan.js"] ?? ""));

const url = process.env.DATABASE_URL;
if (!url) { console.log("   ⏭ DB 칸 검사는 DATABASE_URL 이 없어 건너뜀 — 초록이 아니다"); }
else {
  const c = new pg.Client({ connectionString: url, ssl: /supabase|amazonaws/.test(url) ? { rejectUnauthorized: false } : false });
  await c.connect();
  const cols = (await c.query(`select column_name, is_nullable from information_schema.columns where table_schema='v2' and table_name='push_sub'`)).rows;
  const has = (x) => cols.some((r) => r.column_name === x);
  console.log("■ 처음-4 — 표에 때가 남나");
  ok("push_sub 에 **agreed_at**(언제 동의했나) 이 있다", has("agreed_at"));
  ok("push_sub 에 **revoked_at**(언제 껐나) 이 있다", has("revoked_at"));
  ok("revoked_at 은 비어 있어도 된다 — 비면 「아직 켜져 있다」는 뜻이다(끈 때가 없다는 말이지 모른다는 말이 아니다)", cols.find((r) => r.column_name === "revoked_at")?.is_nullable === "YES");
  const pol = (await c.query(`select policyname, cmd from pg_policies where schemaname='v2' and tablename='push_sub'`)).rows;
  ok("제 기기만 만진다 — push_sub 에 접근 규칙이 있다", pol.length > 0, JSON.stringify(pol));
  await c.end();
}
console.log(`\n■ 알림 동의 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
