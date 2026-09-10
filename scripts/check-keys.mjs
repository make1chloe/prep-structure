/** 연동 열쇠 검사(검사-76 · (터) 확정-72 · 대전제-9) — 열쇠가 화면으로 새지 않나 · 가리기 셈 · 저장 합치기:
 *  ① 판단(lib/integration-plan.js, 순수): 갈래 셋 · 비밀은 길이만 · 알아보기는 앞 넉 자 · 빈 칸이 있으면 안 켜짐 · 비운 칸은 그대로 · 「-」 면 지운다 · 바뀐 것 글에 값이 안 들어간다
 *  ② 글자 검사: 연동 표를 읽는 곳은 손(lib/*.js)뿐 — 화면(app/**)이 v2.integration 을 직접 읽지 않는다 · 설정 화면은 keyBoard(가린 판)만 쓴다 · 열쇠 값이 코드에 안 적혀 있다(대전제-9) */
import { KEYS, keyDef, keyRow, keyRows, maskValue, mergeConfig, changedText } from "../lib/integration-plan.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
console.log("■ 판단 — 가리기 · 다 찼나 · 합치기");
ok("갈래 셋 — 솔라피(문자) · 나이스(학사일정) · 앤트로픽(AI 초안) · 열쇠 이름은 v2.integration 의 id 그대로", KEYS.map((k) => k.id).join() === "solapi,neis,anthropic" && keyDef("solapi").fields.map((f) => f.k).join() === "key,secret,from" && keyDef("nope") === null);
const sol = keyDef("solapi");
ok("비밀(secret)은 길이만 · 알아보기(peek)는 앞 넉 자 · 발신번호는 그대로 · 빈 것은 빈 글", (() => { const r = keyRow(sol, { key: "NCSABCD1234EFGH", secret: "s3cr3tvalue", from: "01012345678" }); const v = Object.fromEntries(r.fields.map((f) => [f.k, f.shown])); return v.key === "NCSA…GH (15자)" && v.secret === "●●●● (11자)" && v.from === "01012345678" && maskValue({ secret: true }, "") === ""; })(), JSON.stringify(keyRow(sol, { key: "NCSABCD1234EFGH", secret: "s3cr3tvalue", from: "01012345678" }).fields.map((f) => f.shown)));
ok("가린 값에 진짜 열쇠가 없다 — 비밀 칸은 어떤 글자도 안 내보낸다", (() => { const secret = "supersecretvalue"; const r = keyRow(sol, { key: "K", secret, from: "010" }); return !r.fields.some((f) => f.secret && String(f.shown).includes(secret.slice(0, 6))); })());
ok("다 차야 「켜짐」 · 빈 칸 이름을 돌려준다", keyRow(sol, { key: "a", secret: "b", from: "c" }).ready === true && keyRow(sol, { key: "a" }).ready === false && keyRow(sol, { key: "a" }).missing.join() === "API Secret,발신번호" && keyRows({}).every((r) => !r.ready));
ok("합치기 — 적은 칸만 바뀐다 · 빈 칸(공백만도)은 그대로 · 「-」 한 글자면 지운다 · 모르는 칸은 안 받는다", (() => { const a = mergeConfig(sol, { key: "old", secret: "keep", from: "010" }, { key: "new", secret: "", from: "   " }); const b = mergeConfig(sol, { key: "old", secret: "keep" }, { secret: "-" }); const c = mergeConfig(sol, { key: "old" }, { nope: "x" }); return JSON.stringify(a) === JSON.stringify({ key: "new", secret: "keep", from: "010" }) && JSON.stringify(b) === JSON.stringify({ key: "old" }) && JSON.stringify(c) === JSON.stringify({ key: "old" }); })());
ok("바뀐 것 글에 값이 안 들어간다(칸 이름만) · 안 바뀌면 그렇게 말한다", (() => { const t = changedText(sol, { key: "old" }, { key: "zzsecret", secret: "s" }); return t === "API Key · API Secret 고쳤습니다" && !t.includes("zzsecret") && changedText(sol, { key: "a" }, { key: "a" }) === "바뀐 것이 없습니다"; })());
console.log("■ 새지 않나(글자)");
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const app = files("app").map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const lib = files("lib").map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const readsTable = app.filter(([, s]) => /from\(["']integration["']\)/.test(s)).map(([p]) => p);
ok("화면(app/**)이 연동 표를 직접 읽지 않는다 — 손(lib)만 읽는다", readsTable.length === 0, readsTable.join(", "));
const KEY_IDS = KEYS.map((k) => k.id);   // 같은 표에 설정값 줄(arrival 학원 회선 · tuition 학년별 기준)도 산다 — 그건 제 손이 쓴다
const badWriters = [...lib, ...app].filter(([p, s]) => p !== "lib/integration.js" && /from\(["']integration["']\)\s*\.(insert|update|upsert|delete)/.test(s) && KEY_IDS.some((id) => new RegExp(`["']${id}["']`).test(s))).map(([p]) => p);
ok("**열쇠 줄**(solapi · neis · anthropic)에 쓰는 곳은 lib/integration.js 하나 — 열쇠를 고치는 길이 하나다(확정-72)", badWriters.length === 0, badWriters.join(", "));
const clientKeys = app.filter(([p, s]) => /^app\/settings\/keys\.js$/.test(p) && /\bconfig\b/.test(s)).map(([p]) => p);
ok("설정 카드(app/settings/keys.js)는 가린 줄(rows)만 받는다 — config 를 안 만진다", clientKeys.length === 0, clientKeys.join(", "));
const hard = [...lib, ...app].filter(([, s]) => /(sk-ant-[A-Za-z0-9_-]{10,}|NCSSOLAPI[A-Za-z0-9]{6,}|(secret|apikey|api_key)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["'])/i.test(s)).map(([p]) => p);
ok("코드에 진짜 열쇠 꼴이 안 적혀 있다(대전제-9)", hard.length === 0, hard.join(", "));
console.log(`\n■ 연동 열쇠 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
