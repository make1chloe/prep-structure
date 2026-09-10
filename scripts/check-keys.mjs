/** 연동 열쇠 검사(검사-76 · (터) 확정-72 · 대전제-9) — 열쇠가 화면으로 새지 않나 · 가리기 셈 · 저장 합치기:
 *  ① 판단(lib/integration-plan.js, 순수): 갈래 셋 · 비밀은 길이만 · 알아보기는 앞 넉 자 · 빈 칸이 있으면 안 켜짐 · 비운 칸은 그대로 · 「-」 면 지운다 · 바뀐 것 글에 값이 안 들어간다
 *  ② 글자 검사: 연동 표를 읽는 곳은 손(lib/*.js)뿐 — 화면(app/**)이 v2.integration 을 직접 읽지 않는다 · 설정 화면은 keyBoard(가린 판)만 쓴다 · 열쇠 값이 코드에 안 적혀 있다(대전제-9) */
import { KEYS, keyDef, keyRow, keyRows, maskValue, mergeConfig, changedText, fieldWhyBad, fieldNag } from "../lib/integration-plan.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
console.log("■ 판단 — 가리기 · 다 찼나 · 합치기");
ok("갈래 넷 — 솔라피(문자) · 나이스(학사일정) · 앤트로픽(AI 초안) · 클래스카드 확장(받는 길 열쇠) · 열쇠 이름은 v2.integration 의 id 그대로", KEYS.map((k) => k.id).join() === "solapi,neis,anthropic,classcard" && keyDef("solapi").fields.map((f) => f.k).join() === "key,secret,from" && keyDef("nope") === null);
const sol = keyDef("solapi");
ok("비밀(secret)은 길이만 · 알아보기(peek)는 앞 넉 자 · 발신번호는 그대로 · 빈 것은 빈 글", (() => { const r = keyRow(sol, { key: "NCSABCD1234EFGH", secret: "s3cr3tvalue", from: "01012345678" }); const v = Object.fromEntries(r.fields.map((f) => [f.k, f.shown])); return v.key === "NCSA…GH (15자)" && v.secret === "●●●● (11자)" && v.from === "01012345678" && maskValue({ secret: true }, "") === ""; })(), JSON.stringify(keyRow(sol, { key: "NCSABCD1234EFGH", secret: "s3cr3tvalue", from: "01012345678" }).fields.map((f) => f.shown)));
ok("가린 값에 진짜 열쇠가 없다 — 비밀 칸은 어떤 글자도 안 내보낸다", (() => { const secret = "supersecretvalue"; const r = keyRow(sol, { key: "K", secret, from: "010" }); return !r.fields.some((f) => f.secret && String(f.shown).includes(secret.slice(0, 6))); })());
ok("다 차야 「켜짐」 · 빈 칸 이름을 돌려준다", keyRow(sol, { key: "a", secret: "b", from: "c" }).ready === true && keyRow(sol, { key: "a" }).ready === false && keyRow(sol, { key: "a" }).missing.join() === "API Secret,발신번호" && keyRows({}).every((r) => !r.ready));
ok("합치기 — 적은 칸만 바뀐다 · 빈 칸(공백만도)은 그대로 · 「-」 한 글자면 지운다 · 모르는 칸은 안 받는다", (() => { const a = mergeConfig(sol, { key: "old", secret: "keep", from: "010" }, { key: "new", secret: "", from: "   " }); const b = mergeConfig(sol, { key: "old", secret: "keep" }, { secret: "-" }); const c = mergeConfig(sol, { key: "old" }, { nope: "x" }); return JSON.stringify(a) === JSON.stringify({ key: "new", secret: "keep", from: "010" }) && JSON.stringify(b) === JSON.stringify({ key: "old" }) && JSON.stringify(c) === JSON.stringify({ key: "old" }); })());
ok("바뀐 것 글에 값이 안 들어간다(칸 이름만) · 안 바뀌면 그렇게 말한다", (() => { const t = changedText(sol, { key: "old" }, { key: "zzsecret", secret: "s" }); return t === "API Key · API Secret 고쳤습니다" && !t.includes("zzsecret") && changedText(sol, { key: "a" }, { key: "a" }) === "바뀐 것이 없습니다"; })());
ok("(터) 비밀이 아닌 칸(발신번호)은 화면 칸에 값이 채워진다 — 저장해 놓고 빈 칸으로 보여 「저장이 안 된다」가 됐다(원장님 2026-09-10)", (() => { const r = keyRow(sol, { key: "K12345678", secret: "S12345678", from: "01027519837" }); const by = Object.fromEntries(r.fields.map((f) => [f.k, f.editable])); return by.from === "01027519837" && by.key === "" && by.secret === ""; })(), JSON.stringify(keyRow(sol, { key: "K12345678", secret: "S", from: "010" }).fields.map((f) => [f.k, f.editable])));
ok("틀린 꼴은 저장 전에 막는다 — 열쇠 자리에 이메일(원장님이 bdyj10@gmail.com 을 API Key 로) · 너무 짧은 것 · 발신번호가 번호가 아닌 것 · 빈 칸과 「-」 는 그냥 지나간다", (() => { const kf = sol.fields[0], ff = sol.fields[2]; return /이메일이 들어왔습니다/.test(fieldWhyBad(kf, "bdyj10@gmail.com") ?? "") && /너무 짧습니다/.test(fieldWhyBad(kf, "abc") ?? "") && /휴대전화 번호/.test(fieldWhyBad(ff, "1234") ?? "") && fieldWhyBad(ff, "010-2751-9837") === null && fieldWhyBad(kf, "NCSABCD1234EFGH") === null && fieldWhyBad(kf, "") === null && fieldWhyBad(kf, "-") === null; })(), String(fieldWhyBad(sol.fields[0], "bdyj10@gmail.com")));
ok("(퍼) 적는 **중**에는 자동완성이 넣은 이메일만 바로 말한다 — 「너무 짧다」는 다 적기 전엔 안 말하고(저장할 때 막는다) · 번호는 열 자리부터 말한다", (() => { const kf = sol.fields[0], ff = sol.fields[2]; return /이메일이/.test(fieldNag(kf, "bdyj10@gmail.com") ?? "") && fieldNag(kf, "abc") === null && fieldWhyBad(kf, "abc") !== null && fieldNag(ff, "010") === null && /휴대전화 번호/.test(fieldNag(ff, "02-2751-9837") ?? "") && fieldNag(ff, "010-2751-9837") === null && fieldNag(kf, "") === null && fieldNag(kf, "-") === null; })(), String(fieldNag(sol.fields[0], "abc")));
ok("(퍼) 넣어 **둔** 값이 틀린 꼴이면 그 줄이 스스로 말한다 — 이메일이 API Key 로 들어가 있으면 「다 찼다」인데도 문자는 안 나간다(원장님 DB 가 그 꼴이었다)", (() => { const r = keyRow(sol, { key: "bdyj10@gmail.com", secret: "s3cr3tvalue", from: "01027519837" }); const good = keyRow(sol, { key: "NCSABCD1234EFGH", secret: "s3cr3tvalue", from: "01027519837" }); return r.bad.length === 1 && /이메일이 들어왔습니다/.test(r.bad[0]) && !r.bad[0].includes("bdyj10") && r.ready === true && good.bad.length === 0; })(), JSON.stringify(keyRow(sol, { key: "bdyj10@gmail.com", secret: "s3cr3tvalue", from: "01027519837" }).bad));
console.log("■ 새지 않나(글자)");
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const app = files("app").map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const lib = files("lib").map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const readsTable = app.filter(([, s]) => /from\(["']integration["']\)/.test(s)).map(([p]) => p);
ok("화면(app/**)이 연동 표를 직접 읽지 않는다 — 손(lib)만 읽는다", readsTable.length === 0, readsTable.join(", "));
const KEY_IDS = KEYS.map((k) => k.id);   // 같은 표에 설정값 줄(arrival 학원 회선 · tuition 학년별 기준)도 산다 — 그건 제 손이 쓴다
const badWriters = [...lib, ...app].filter(([p, s]) => p !== "lib/integration.js" && /from\(["']integration["']\)\s*\.(insert|update|upsert|delete)/.test(s) && KEY_IDS.some((id) => new RegExp(`["']${id}["']`).test(s)) && /from\(["']integration["']\)\s*\.(insert|update|upsert)\(\s*\{[^}]*\bconfig\b/.test(s)).map(([p]) => p);
ok("**열쇠 값**(config)을 쓰는 곳은 lib/integration.js 하나 — 열쇠를 고치는 길이 하나다(확정-72). 받은 때·까닭(last_ok_at · last_error)은 그 길의 손도 적는다(문자 시험 · 클래스카드 받기)", badWriters.length === 0, badWriters.join(", "));
const clientKeys = app.filter(([p, s]) => /^app\/settings\/keys\.js$/.test(p) && /\bconfig\b/.test(s)).map(([p]) => p);
ok("설정 카드(app/settings/keys.js)는 가린 줄(rows)만 받는다 — config 를 안 만진다", clientKeys.length === 0, clientKeys.join(", "));
const hard = [...lib, ...app].filter(([, s]) => /(sk-ant-[A-Za-z0-9_-]{10,}|NCSSOLAPI[A-Za-z0-9]{6,}|(secret|apikey|api_key)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["'])/i.test(s)).map(([p]) => p);
ok("코드에 진짜 열쇠 꼴이 안 적혀 있다(대전제-9)", hard.length === 0, hard.join(", "));
console.log("■ (퍼) 자동완성이 열쇠를 덮지 않나 — 원장님 2026-09-10 「저장이안돼 뭔가 자동완성같은데 · 고쳐도 다시 보면 계속 저 화면으로바뀌어」");
const keysCode = strip(readFileSync("app/settings/keys.js", "utf8"));
ok("열쇠 칸에 type=password 를 **안** 쓴다 — 짝(아이디+비밀번호)으로 보이면 크롬이 저장된 로그인을 넣어 열쇠를 덮는다 · 가리기는 -webkit-text-security 로 한다", !/["'`]password["'`]/.test(keysCode) && /WebkitTextSecurity/.test(keysCode), keysCode.split("\n").filter((l) => /password/.test(l)).join(" / "));
ok("칸마다 자동완성 끄기가 붙는다(autoComplete off · 1Password · LastPass · 대시레인) — 한 벌(NOFILL)로만 적어 칸마다 어긋나지 않는다", /const NOFILL = \{/.test(keysCode) && /data-1p-ignore/.test(keysCode) && /data-lpignore/.test(keysCode) && /\{\.\.\.NOFILL\}/.test(keysCode) && (keysCode.match(/autoComplete/g) || []).length === 1);
ok("틀린 꼴은 **적는 그 자리에서** 말한다 — 화면이 fieldNag 를 쓴다(판단은 순수 모듈 한 벌)", /fieldNag\(/.test(keysCode) && !/fieldWhyBad/.test(keysCode));
ok("(퍼) 넣어 둔 값이 틀린 꼴이면 꼬리표가 「고쳐야 함」 · 까닭을 그 줄에 적는다(key-bad · 값은 안 적는다)", /고쳐야 함/.test(keysCode) && /data-g="key-bad"/.test(keysCode) && /r\.bad/.test(keysCode));
ok("(퍼) 저장한 때가 줄에 보인다 — 「고침 9/10 23:41」(비밀 칸은 값을 안 돌려주니, 저장이 됐는지 알 길이 이것뿐이다 · 원장님 9/10 「저장눌러도 저장안됨」)", /data-g="key-saved"/.test(keysCode) && /r\.updated_at/.test(keysCode) && /seoulTime/.test(keysCode));
ok("줄 요약과 빨간 글을 걷기가 갈라 볼 수 있다 — 요약에 data-g=key-sum 표시(둘 다 small 이라 「둘이 잡힌다」로 걷기가 멈췄다 · 게이트 102)", /data-g="key-sum"/.test(keysCode) && /data-g="key-why"/.test(keysCode));
console.log(`\n■ 연동 열쇠 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
