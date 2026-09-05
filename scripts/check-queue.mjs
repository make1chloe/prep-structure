/** 자동화 뼈대 검사(뼈대-1·3·5·6·9·10) — 큐는 v2.job_queue 하나(0012), 자물쇠는 locked_at, 임계값은 v2.rule(0100), 크론은 오늘을 받고 day_ran 을 보며 runDue 만 부른다 */
import { readFileSync } from "node:fs";
const q12 = readFileSync("supabase/migrations/0012_notify.sql", "utf8"), s100 = readFileSync("supabase/migrations/0100_new_app_skeleton.sql", "utf8");
const q = readFileSync("lib/queue.js", "utf8"), cron = readFileSync("app/api/cron/route.js", "utf8");
const bad = [];
const queue = q12.slice(q12.indexOf("create table v2.job_queue"), q12.indexOf("comment on table v2.job_queue"));
for (const c of ["state", "tries", "next_at", "locked_at", "last_error"]) if (!new RegExp(`\\b${c}\\b`).test(queue)) bad.push(`v2.job_queue 에 ${c} 칸이 없다(뼈대-1)`);
if (!/create table v2\.day_ran/.test(q12)) bad.push("v2.day_ran 이 없다(뼈대-6)");
if (/create table if not exists v2\.(queue|cron_run)/.test(s100)) bad.push("0100 이 큐·「오늘 돌았나」를 또 세운다 — 0012 에 이미 있다(원칙-1)");
if (!/function v2\.enqueue/.test(s100)) bad.push("v2.enqueue 가 없다 — 사람은 큐에 직접 못 쓴다(0017)");
if (!/locked_at/.test(q) || !/job_queue/.test(q)) bad.push("lib/queue.js 가 v2.job_queue 의 locked_at 을 자물쇠로 안 쓴다");
if (!/rpc\("enqueue"/.test(q)) bad.push("lib/queue.js 가 v2.enqueue 로 안 넣는다");
for (const k of q.matchAll(/rule(?:Int|List)?\(sb, ["']([a-z._]+)["']\)/g)) if (!s100.includes(`'${k[1]}'`)) bad.push(`규칙 ${k[1]} 이 0100 의 v2.rule 씨앗에 없다(뼈대-5)`);
if (/max(Attempts|_attempts)\s*=\s*\d/.test(q) || /\[\s*1\s*,\s*5\s*,\s*30/.test(q)) bad.push("lib/queue.js 에 임계값이 박혀 있다(뼈대-5)");
if (!/rpc\("today"\)/.test(cron)) bad.push("크론이 학원의 오늘(v2.today)을 안 받는다(뼈대-10)");
if (!/runDue\(/.test(cron)) bad.push("크론이 lib/queue.js 의 runDue 를 안 부른다(뼈대-9)");
if (!/day_ran/.test(cron)) bad.push("크론이 「오늘 이미 돌았나」(v2.day_ran)를 안 본다(뼈대-6)");
if (bad.length) { console.log("check-queue ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log("check-queue ✓ 큐는 v2.job_queue 하나 · 자물쇠 locked_at · 넣기는 v2.enqueue · 임계값은 v2.rule · 크론은 오늘을 받고 day_ran 을 보며 runDue 만");
