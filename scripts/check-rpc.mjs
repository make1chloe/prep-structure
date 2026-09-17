/** DB 함수(.rpc)의 **결과를 안 보는 자리가 없다** ((어71) · 원장님 2026-09-17 「여기서 화면이 안넘어감」).
 *  까닭: supabase 는 오류를 **던지지 않고 돌려준다**({ data, error }). 결과를 안 받으면 함수가 아예 없어도 코드는 그냥 다음 줄로 간다.
 *  실제로 비밀번호를 바꾼 뒤 `await db(sb).rpc("password_changed")` 의 결과를 안 봐서, 표시가 안 내려간 채 다음 화면이 다시 비밀번호 화면으로 되돌렸다.
 *  화면은 그대로여서 원장님 눈에는 「단추를 눌러도 안 넘어간다」였다(대전제-0 — 화면은 거짓말하지 않는다).
 *  재는 법: app · lib 의 `.rpc(` 자리마다 **결과를 받는가**를 본다 — `= await …`(담기) · `row(await …)`·`changed(await …)`(도우미가 본다) ·
 *  파도(Promise.all) 안의 줄(뒤에서 갈라 받는다). 셋 다 아니면 **버린 것**이다. 서버 로그에만 남기는 곳도 결과는 받아야 한다. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const strip = (z) => z.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 폰-5 주석은 먼저 지운다
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : files(p)) : /\.js$/.test(f) ? [p] : []; });

/** 이 한 줄이 .rpc 의 결과를 받는가 */
function takes(line) {
  const i = line.indexOf(".rpc(");
  if (i < 0) return true;
  const head = line.slice(0, i);
  if (/^\s*\./.test(line)) return true;                       // 앞 줄에서 이어진 줄(…\n  .rpc(…)) — 앞 줄이 받는다
  const w = head.lastIndexOf("await ");
  if (w >= 0) { const before = head.slice(0, w).trim();        // await 바로 앞이 무엇인가
    return /[=([,]$/.test(before) || /^return$/.test(before); }  // = 담기 · ( 도우미가 삼킴 · , [ 목록 안 · return 돌려줌
  const t = line.trim();
  return /[=,[]/.test(head) || /^return\b/.test(t) || /,\s*$/.test(t);   // await 가 없으면 파도(Promise.all)의 줄 — 뒤에서 갈라 받는다
}

console.log("■ DB 함수(.rpc) 결과를 버린 자리");
const src = [...files("app"), ...files("lib")].map((p) => [p, strip(readFileSync(p, "utf8"))]);
const sites = [];
for (const [p, s] of src) s.split("\n").forEach((line, k) => { if (line.includes(".rpc(")) sites.push({ p, line: k + 1, text: line, ok: takes(line) }); });
const dropped = sites.filter((s) => !s.ok);
ok(`.rpc 자리 ${sites.length}곳이 다 결과를 받는다(= 담기 · row(…)·changed(…) · 파도 안의 줄)`, dropped.length === 0,
  dropped.map((d) => `${d.p}:${d.line}`).join(" · "));
ok("자리를 못 찾은 것이 아니다(app·lib 에서 15곳 넘게 센다 — 훑기가 헛돌면 늘 초록이라 못 믿는다)", sites.length >= 15, `${sites.length}곳`);

console.log("■ 비밀번호 바꾸기 — 셋을 다 보고 간다((어71))");
const act = src.find(([p]) => p === "app/password/actions.js")[1];
ok("① 바꾸기 실패 · ② 표시 내리기 실패 · ③ **정말 내려갔나 다시 읽기** 를 다 보고, 걸리면 까닭을 달고 이 화면으로 되돌린다",
  /const \{ error \} = await sb\.auth\.updateUser/.test(act) && /const \{ error: e1 \} = await db\(sb\)\.rpc\("password_changed"\)/.test(act)
  && /select\("must_change_pw"\)/.test(act) && /data\?\.must_change_pw/.test(act) && (act.match(/return back\(/g) ?? []).length >= 4);
ok("redirect 는 try **밖에서** 한 번 부른다(redirect 는 던지는 것이라 try 안에서 부르면 catch 가 삼켜 아무 일도 안 난다)",
  /\} catch \(e\) \{ go = back\(/.test(act) && /\n  redirect\(go\);/.test(act) && !/try \{[\s\S]*?redirect\([\s\S]*?\} catch/.test(act));
ok("오류 글은 lib/sqlError saidBy 를 지난다(「함수가 없다」 → 어느 붙여넣기 SQL 인지 · 원칙-1 옮기는 자리는 한 곳)",
  /import \{ saidBy \} from "@\/lib\/sqlError"/.test(act) && (act.match(/saidBy\(/g) ?? []).length >= 3);
const page = src.find(([p]) => p === "app/password/page.js")[1];
ok("표시가 이미 내려갔는데 이 화면에 서 있으면 제 화면으로 보낸다(갇히지 않는다 · 이 화면은 문지기만 열어 준다)",
  /if \(me && !me\.must_change_pw\) redirect\(homeFor\(me\.role\)\)/.test(page));

console.log("■ 함수가 없다는 DB 말 → 어느 붙여넣기 SQL 인가");
const { saidBy, FN_PASTE } = await import("../lib/sqlError.js");
const said = saidBy("Could not find the function v2.password_changed without parameters in the schema cache");
ok("「Could not find the function …」 → 0173 을 가리킨다(schema cache 글보다 먼저)", said.includes("0173") && said.includes("password_changed") && !said.includes("옛 표 모양"), said.slice(0, 90));
ok("가리키는 붙여넣기 파일이 실제로 있다", Object.values(FN_PASTE).every(([f]) => { try { readFileSync(`docs/sql-paste/${f}.sql`); return true; } catch { return false; } }), Object.values(FN_PASTE).map(([f]) => f).join(","));

console.log(`\n■ DB 함수 결과 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
