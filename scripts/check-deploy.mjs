/** 배포 검사(대전제-13) — 전환일 전에 v2 가 운영(Production)으로 지어지지 않게 vercel.json 의 ignoreCommand 가 살아 있나.
 *  사고 2026-09-05: 운영 주소(chloe-english.vercel.app)에 옛 v2 빌드가 떠 학원 앱이 죽어 있었다. 코드가 막을 수 있는 것은 「v2 브랜치가 운영으로 빌드되는 것」뿐이다 —
 *  Vercel 환경변수 V2_PRODUCTION_OK=1 이 있을 때만 짓는다(전환일에 켠다). 크론 길도 같이 본다(운영 빌드에서만 돈다). */
import { readFileSync } from "node:fs";
const bad = [];
let v;
try { v = JSON.parse(readFileSync("vercel.json", "utf8")); } catch (e) { console.log(`check-deploy ✗\n  vercel.json 을 못 읽는다 — ${e.message}`); process.exit(1); }
const ic = String(v.ignoreCommand ?? "");
if (!ic) bad.push("ignoreCommand 가 없다 — v2 가 운영으로 빌드된다(대전제-13)");
if (!/\$VERCEL_ENV"? = "?production/.test(ic)) bad.push("ignoreCommand 가 VERCEL_ENV=production 을 안 본다");
if (!/V2_PRODUCTION_OK/.test(ic)) bad.push("ignoreCommand 에 전환일 열쇠 V2_PRODUCTION_OK 가 없다 — 전환일에 코드를 고쳐야 하게 된다");
if (!/exit 0/.test(ic) || !/exit 1/.test(ic)) bad.push("ignoreCommand 가 건너뜀(exit 0)·지음(exit 1) 둘 다 말하지 않는다");
if (!(v.crons ?? []).some((c) => c.path === "/api/cron")) bad.push("crons 에 /api/cron 이 없다 — 예약 발송 백스톱(속도-3)이 안 돈다");
// (어11) **푸시를 빠뜨렸나** — 2026-09-12 사고: 이틀치 커밋 일곱을 작업 브랜치에만 밀고 **배포되는 v2 에는 안 올렸다**.
// 원장님이 「바뀐게없는듯」 하고 잡아 주셨다. v2 앱의 CLAUDE.md 30줄에 「작업 브랜치와 v2 둘 다에 푸시한다」고 적혀 있었는데
// 내가 **옛 앱 쪽 CLAUDE.md**(「작업 브랜치와 main」)를 읽고 있었다. 사람이 안 잊게 **여기서 잡는다** — 망이 없으면 건너뜀(초록 아님).
const { execSync } = await import("node:child_process");
const 조용히 = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
const here = 조용히("git rev-parse HEAD");
const v2 = (조용히("git ls-remote origin v2") ?? "").split(/\s/)[0] || null;
let 푸시 = null;
if (!here || !v2) 푸시 = "skip";
else if (here === v2) 푸시 = "ok";
else {
  const 앞선것 = 조용히(`git rev-list --count ${v2}..HEAD`);            // 내 것 중 v2 에 없는 커밋
  푸시 = 앞선것 && Number(앞선것) > 0 ? `behind:${앞선것}` : "ok";        // v2 가 더 앞서 있으면(남이 민 것) 여기서 안 잡는다
}
if (푸시?.startsWith("behind:")) bad.push(`**배포되는 v2 에 안 올라간 커밋 ${푸시.slice(7)}개** — git push origin HEAD:v2 (CLAUDE.md 「작업 브랜치와 v2 둘 다에 푸시한다」)`);

// 원장님 2026-09-09 「전환일따로 없음」(대전제-1) — 규칙 글이 아직 「전환일에 켠다」고 말하면 내가 또 낡은 답을 드린다
const 규칙 = readFileSync("docs/규칙.md", "utf8");
const d13 = (규칙.match(/\| \*\*대전제-13\*\* \|[^\n]*/) ?? [""])[0];
if (/전환일에 |전환일 전/.test(d13)) bad.push("대전제-13 이 아직 **날짜**로 적혀 있다(「전환일에 …」 · 「전환일 전 …」) — 원장님 9/9 「전환일따로 없음」(대전제-1)과 어긋난다. 날이 아니라 **스위치**(V2_PRODUCTION_OK)로 적는다");   // 「전환일이라는 날은 없다」처럼 **없다고 적는 것**은 잡지 않는다

if (bad.length) { console.log("check-deploy ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-deploy ✓ 운영 빌드는 V2_PRODUCTION_OK 가 있어야 지어진다 · 크론 /api/cron · 배포 브랜치 v2 ${푸시 === "skip" ? "(망이 없어 건너뜀 — 초록 아님)" : "와 같다"}`);
