/** 밖으로 나가는 길 검사(검사-①·⑦ · 대전제-7 · 뼈대-11 · 확정-㊿ · 속도-3) — 글자로 훑는다:
 *  ① 알림 서버를 부르는 자리(sendNotification)는 lib/push.js 하나 · lib/push.js 를 들여오는 곳은 lib/notify.js 하나 · notify_log 에 쓰는 곳은 lib/notify.js 하나
 *  ⑦ 스위치(NOTIFY_SINK)를 읽는 곳은 lib/notify-plan.js 하나 — 화면·손이 제멋대로 안 본다
 *  큐에 넣는 갈래마다 손이 있다(lib/send.js) · 늦귀가 알림을 넣는 곳은 lib/late.js 하나(확정-㊿) · 데일리리포트 손이 치환 자리를 본다(뼈대-11) · 크론이 손을 들여온다 · 발송 화면은 백스톱을 렌더 뒤(after)로 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 폰-5 주석을 먼저 지운다 — 주석의 낱말로 헛짚고 헛통과하지 않게
const all = [...files("lib"), ...files("app")].map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const bad = [];
const where = (re, except = []) => all.filter(([p, s]) => re.test(s) && !except.includes(p)).map(([p]) => p);
let w = where(/sendNotification\(/, ["lib/push.js"]); if (w.length) bad.push(`① 알림 서버를 lib/push.js 밖에서 부른다: ${w.join(", ")}`);
w = where(/from ["'](\.\/push\.js|@\/lib\/push)["']/, ["lib/notify.js"]); if (w.length) bad.push(`① lib/push.js 를 lib/notify.js 밖에서 들여온다: ${w.join(", ")}`);
w = where(/from\("notify_log"\)\.(insert|update|upsert|delete)/, ["lib/notify.js"]); if (w.length) bad.push(`① notify_log 에 lib/notify.js 밖에서 쓴다: ${w.join(", ")}`);
w = where(/(process\.env|\benv)\.NOTIFY_SINK|\[["']NOTIFY_SINK["']\]/, ["lib/notify-plan.js"]); if (w.length) bad.push(`⑦ 스위치를 lib/notify-plan.js 밖에서 읽는다: ${w.join(", ")}`);
w = where(/from ["'](\.\/solapi\.js|@\/lib\/solapi)["']/, ["lib/notify.js"]); if (w.length) bad.push(`① 문자 서버(lib/solapi.js)를 lib/notify.js 밖에서 들여온다: ${w.join(", ")}`);   // (커) 문자도 같은 길 한 곳
w = where(/solapi\.com/, ["lib/solapi.js"]); if (w.length) bad.push(`① 문자 서버 주소를 lib/solapi.js 밖에서 쓴다: ${w.join(", ")}`);
if (/node:crypto/.test(readFileSync("lib/sms-plan.js", "utf8"))) bad.push("① lib/sms-plan.js 는 화면도 가져온다 — node:crypto 를 쓰면 빌드가 깨진다(게이트 96)");
w = where(/["']late_notice["']/, ["lib/late.js", "lib/send-plan.js"]).filter((p) => !/^scripts\//.test(p)); if (w.length) bad.push(`확정-㊿ 늦귀가 알림을 lib/late.js 밖에서 넣는다: ${w.join(", ")}`);
// 큐에 넣는 갈래 ⊆ 손이 있는 갈래
const send = strip(readFileSync("lib/send.js", "utf8")), plan = strip(readFileSync("lib/send-plan.js", "utf8"));
const kinds = Object.fromEntries([...plan.matchAll(/(\w+): "([a-z_]+)"/g)].filter(([, k]) => /^(daily|late|arrival|leave|plan)$/.test(k)).map(([, k, v]) => [k, v]));
const handled = new Set([...send.matchAll(/handlers\[KINDS\.(\w+)\]/g)].map((m) => kinds[m[1]]));
const enqueued = new Set(all.flatMap(([, s]) => [...s.matchAll(/enqueue\(\w+, "([a-z_]+)"/g)].map((m) => m[1])));
for (const k of enqueued) if (!handled.has(k)) bad.push(`큐에 넣는 갈래에 손이 없다: ${k} (lib/send.js)`);
if (!/unfilled\(s\.comment\)/.test(send)) bad.push("뼈대-11 데일리리포트 손이 치환 자리를 안 본다(lib/send.js)");
if (!/import "@\/lib\/send"/.test(strip(readFileSync("app/api/cron/route.js", "utf8")))) bad.push("크론이 손(lib/send.js)을 안 들여온다 — 손이 없는 일로 전부 실패한다");
const page = strip(readFileSync("app/send/page.js", "utf8"));
if (!/after\(backstop\)/.test(page) || /await backstop/.test(page)) bad.push("속도-3 발송 화면이 백스톱을 렌더 뒤(after)로 안 돌린다");
if (!/OPEN_TO_SEE/.test(readFileSync("lib/notify-plan.js", "utf8"))) bad.push("잠금화면 문구(OPEN_TO_SEE)가 없다 — 알림에 내용이 실린다");
if (bad.length) { console.log("check-notify ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-notify ✓ 나가는 길 한 곳(lib/notify.js → lib/push.js) · 스위치 한 곳 · 손 ${handled.size}개가 큐 갈래 ${enqueued.size}개를 다 받는다 · 늦귀가는 lib/late.js 만 · 치환 자리 문 · 백스톱은 렌더 뒤`);
