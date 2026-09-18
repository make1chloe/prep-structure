#!/usr/bin/env node
/** 빠른 게이트 — 고친 파일을 보고 **필요한 것만** 돌린다(원장님 2026-09-18 「ⓐ 지금 지어 둔다」).
 *
 *  왜 지었나 — 2026-09-18 하루에 통째 게이트를 **아홉 번**(각 25분) 돌렸고, 그 가운데 네 번은
 *  **글자만 읽는 파수꾼**이 잡을 것 때문에 터졌다(그림 표 · 동사 👉 · 말 사전 · 문장 · 고르기 래칫 · 문서 숫자).
 *  그 77개는 다 합쳐 **11초**다. 25분을 쓰기 전에 11초를 쓰면 된다.
 *
 *  ⚠️ 이것은 **고쳐 가는 동안** 쓰는 것이다. **푸시 전에는 통째로 한 번**(bash scripts/e2e/run.sh + check-all) 돌린다.
 *     빠른 게이트는 「무엇을 건너뛰었나」를 늘 큰 소리로 적는다 — 건너뛴 것을 돌았다고 말하지 않는다(대전제-0).
 *
 *  쓰기:
 *    node scripts/gate.mjs            바뀐 파일을 보고 필요한 것만
 *    node scripts/gate.mjs --quick    글자 파수꾼만(11초)
 *    node scripts/gate.mjs --base v2  그 갈래와 견줘 바뀐 파일로
 *    node scripts/gate.mjs --plan     무엇을 돌릴지만 보이고 안 돌린다
 */
import { execFileSync, execSync } from "node:child_process";
import { readdirSync, existsSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PLAN = has("--plan"), QUICK = has("--quick"), BASE = val("--base");
const APP = "http://127.0.0.1:3300";
const DB_URL = "postgres://postgres@127.0.0.1:55440/chloe";

/* ── 파수꾼 갈래 — 파일이 스스로 말하게 한다(목록을 손으로 적으면 새 검사가 조용히 빠진다) */
const checks = readdirSync("scripts").filter((f) => /^check-.*\.mjs$/.test(f));
const src = (f) => readFileSync(`scripts/${f}`, "utf8");
const needsDb = (f) => /DATABASE_URL|from "pg"|_ap\.mjs/.test(src(f));
const needsBrowser = (f) => /_browser\.mjs/.test(src(f));
const GLYPH = checks.filter((f) => !needsDb(f) && !needsBrowser(f));
const DBC = checks.filter(needsDb);
const BROWSER = checks.filter(needsBrowser);

/* ── 무엇이 바뀌었나 */
const changed = (() => {
  if (BASE) return execSync(`git diff --name-only ${BASE}...HEAD; git status --porcelain | awk '{print $2}'`, { encoding: "utf8" }).split("\n").filter(Boolean);
  return execSync(`git status --porcelain | awk '{print $2}'`, { encoding: "utf8" }).split("\n").filter(Boolean);
})();
const hit = (re) => changed.some((f) => re.test(f));
const 앱 = hit(/^(app|lib)\//) || hit(/globals\.css$/) || hit(/^(next\.config|package\.json)/);
const 목업 = hit(/^docs\/목업\//);
const 표 = hit(/^supabase\/migrations\//);
const 걷기 = hit(/^scripts\/e2e\/.*\.mjs$/);
const 검사만 = changed.length > 0 && !앱 && !목업 && !표 && !걷기;

/* ── 자리가 서 있나(있으면 다시 안 세운다 — up.sh 는 매번 DB 를 통째로 지우고 다시 만든다) */
const alive = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); return true; } catch { return false; } };
const dbUp = alive(`curl -sf -o /dev/null http://127.0.0.1:55441/ && curl -sf -o /dev/null http://127.0.0.1:55442/health`);
const appUp = alive(`curl -sf -o /dev/null ${APP}/`);

/* ── 무엇을 할까 */
const doGlyph = true;
const doDb = !QUICK && (표 || (!검사만 && DBC.some((f) => changed.some((c) => c.includes("migrations")))) || 표);
const doUp = !QUICK && !dbUp && (표 || 앱 || 걷기);          // 자리가 없으면 세운다
const doBuild = !QUICK && (앱 || 목업) ;                       // 걷기 파일만 고쳤으면 빌드는 필요 없다
const doWalk = !QUICK && (앱 || 목업 || 걷기 || 표);
const doScreen = !QUICK && (앱 || 목업);                       // 치수·글꼴·대비·무대시
const doDbChecks = !QUICK && (표 || 앱);

const 건너뛴 = [];
if (!doUp && (doWalk || doDbChecks)) 건너뛴.push(dbUp ? "DB 다시 세우기(자리가 이미 서 있다)" : "DB");
if (!doBuild && doWalk) 건너뛴.push("앱 빌드(앱·목업이 안 바뀌었다)");
if (!doWalk) 건너뛴.push("걷기(screens · today)");
if (!doScreen) 건너뛴.push("화면 검사(치수·글꼴·대비·무대시)");
if (!doDbChecks) 건너뛴.push(`DB 파수꾼 ${DBC.length}종`);

console.log(`■ 빠른 게이트 — 바뀐 파일 ${changed.length}개${changed.length ? ` (${changed.slice(0, 6).join(" · ")}${changed.length > 6 ? " …" : ""})` : ""}`);
console.log(`   돌린다: 글자 파수꾼 ${GLYPH.length}종${doUp ? " · DB 세우기" : ""}${doBuild ? " · 빌드" : ""}${doWalk ? " · 걷기" : ""}${doScreen ? ` · 화면 검사 ${BROWSER.length}종` : ""}${doDbChecks ? ` · DB 파수꾼 ${DBC.length}종` : ""}`);
if (건너뛴.length) console.log(`   ⚠️ 건너뛴다: ${건너뛴.join(" · ")} — **푸시 전에는 통째로 한 번**(bash scripts/e2e/run.sh)`);
if (PLAN) process.exit(0);

let bad = 0;
const run = (what, cmd, env = {}) => {
  const t = Date.now();
  try { execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } }); console.log(`   ✅ ${what} · ${Math.round((Date.now() - t) / 1000)}초`); return true; }
  catch { console.log(`   ❌ ${what} · ${Math.round((Date.now() - t) / 1000)}초`); bad++; return false; }
};

/* ① 글자 파수꾼 — 11초. 여기서 터지면 **더 안 간다**(25분을 아낀다) */
{ const t = Date.now(); const fails = [];
  for (const f of GLYPH) { try { execFileSync("node", [`scripts/${f}`], { stdio: "pipe" }); } catch { fails.push(f.replace(/^check-|\.mjs$/g, "")); } }
  console.log(`\n■ 글자 파수꾼 ${GLYPH.length}종 · 실패 ${fails.length} · ${Math.round((Date.now() - t) / 1000)}초`);
  if (fails.length) { console.log(`   ❌ ${fails.join(" · ")}\n   → 하나씩 보세요: node scripts/check-<이름>.mjs`); process.exit(1); } }
if (QUICK) process.exit(0);

/* ② 자리 · 빌드 · 걷기 */
if (doUp) { console.log("\n■ 자리 세우기(DB · PostgREST · 인증 흉내)"); run("up.sh", "bash scripts/e2e/up.sh"); }
if (doBuild) { console.log("\n■ 앱 빌드");
  run("next build", "npx next build --webpack > /var/tmp/gate-build.log 2>&1 || (tail -30 /var/tmp/gate-build.log; false)"); }
if ((doBuild || !appUp) && doWalk) { console.log("\n■ 앱 띄우기");
  execSync(`pkill -9 -f "[n]ext-server" 2>/dev/null; true`);
  execSync(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55442 NEXT_PUBLIC_SUPABASE_ANON_KEY=$(node scripts/e2e/token.mjs anon) SUPABASE_SERVICE_ROLE_KEY=$(node scripts/e2e/token.mjs service_role) nohup npx next start -p 3300 > /var/tmp/gate-next.log 2>&1 &`, { shell: "/bin/bash" });
  execSync(`for i in $(seq 1 60); do curl -sf -o /dev/null ${APP}/ && break; sleep 2; done`, { shell: "/bin/bash" }); }
if (doWalk) {
  const 상태있음 = existsSync(".tmp/state-student.json") && existsSync(".tmp/state-parent.json");
  const onlyToday = 걷기 && !앱 && !목업 && !표 && changed.every((f) => !/screens\.mjs$/.test(f));
  if (!(onlyToday && 상태있음)) { console.log("\n■ 화면 걷기(screens)"); run("screens.mjs", "node scripts/e2e/screens.mjs", { E2E_APP: APP }); }
  else console.log("\n   ⚠️ 걷기 screens 건너뜀 — today.mjs 만 고쳤고 로그인 상태 파일(.tmp/state-*.json)이 이미 있다");
  console.log("\n■ 오늘 수업 걷기(today)"); run("today.mjs", "node scripts/e2e/today.mjs", { E2E_APP: APP });
}
/* ③ 화면 파수꾼 · DB 파수꾼 */
if (doScreen) { console.log("\n■ 화면 검사(치수 · 글꼴 · 대비 · 무대시)");
  for (const f of BROWSER) run(f.replace(/^check-|\.mjs$/g, ""), `node scripts/${f}`, { CHECK_STATE: ".tmp/state-principal.json" }); }
if (doDbChecks) { console.log(`\n■ DB 파수꾼 ${DBC.length}종`);
  for (const f of DBC) run(f.replace(/^check-|\.mjs$/g, ""), `node scripts/${f}`, { DATABASE_URL: DB_URL }); }

console.log(`\n■ 빠른 게이트 끝 · 실패 ${bad}${건너뛴.length ? `\n   ⚠️ 건너뛴 것: ${건너뛴.join(" · ")} — **푸시 전에는 통째로**(bash scripts/e2e/run.sh)` : ""}`);
process.exit(bad ? 1 : 0);
