/** 자동화 뼈대 검사(뼈대-1·5·6·9·10) — 큐 표에 다섯 칸, 자물쇠는 locked_at, 임계값은 v3.rule, 크론은 오늘을 인자로 받고 새 셈을 안 만든다 */
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/0100_v3_skeleton.sql", "utf8");
const q = readFileSync("lib/queue.js", "utf8"), cron = readFileSync("app/api/cron/route.js", "utf8");
const bad = [];
const queue = sql.slice(sql.indexOf("create table if not exists v3.queue"), sql.indexOf("comment on table v3.queue"));
for (const c of ["state", "attempts", "next_try_at", "locked_at", "last_error"]) if (!new RegExp(`\\b${c}\\b`).test(queue)) bad.push(`v3.queue 에 ${c} 칸이 없다(뼈대-1)`);
if (!/why_table/.test(queue) || !/why_id/.test(queue)) bad.push("v3.queue 가 왜 생겼는지(why_table·why_id)를 안 가리킨다(뼈대-3)");
if (!/create table if not exists v3\.cron_run/.test(sql)) bad.push("v3.cron_run 이 없다(뼈대-6)");
if (!/locked_at/.test(q)) bad.push("lib/queue.js 가 locked_at 을 자물쇠로 안 쓴다");
for (const k of q.matchAll(/rule(?:Int|List)?\(sb, ["']([a-z._]+)["']\)/g)) if (!sql.includes(`'${k[1]}'`)) bad.push(`규칙 ${k[1]} 이 0100 의 v3.rule 씨앗에 없다(뼈대-5)`);
if (/max(Attempts|_attempts)\s*=\s*\d/.test(q) || /\[\s*1\s*,\s*5\s*,\s*30/.test(q)) bad.push("lib/queue.js 에 임계값이 박혀 있다(뼈대-5)");
if (!/rpc\("today"\)/.test(cron)) bad.push("크론이 학원의 오늘(v3.today)을 안 받는다(뼈대-10)");
if (!/runDue\(/.test(cron)) bad.push("크론이 lib/queue.js 의 runDue 를 안 부른다(뼈대-9)");
if (!/cron_run/.test(cron)) bad.push("크론이 「오늘 이미 돌았나」를 표에 안 적는다(뼈대-6)");
if (bad.length) { console.log("check-queue ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log("check-queue ✓ 큐 다섯 칸 · 자물쇠 locked_at · 임계값은 v3.rule · 크론은 오늘을 받고 runDue 만 부른다");
