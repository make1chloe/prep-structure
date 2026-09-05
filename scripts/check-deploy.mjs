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
if (bad.length) { console.log("check-deploy ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log("check-deploy ✓ 전환일 전 운영 빌드 건너뜀(V2_PRODUCTION_OK 없으면) · 크론 /api/cron");
