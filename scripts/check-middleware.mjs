/** 세션 갱신 검사((어29) · 검사-92 · 원장님 2026-09-15 「페이지 이동시 맨위 메뉴가 사라짐」) · middleware.js 가 있고, 끝난 세션만 갱신해 쿠키에 되쓰나:
 *  createServerClient(요청 쿠키 읽기 · 응답 쿠키 쓰기) · getSession(getUser 아님 · 속도-2) · 정적 파일은 안 건드림 · 키 읽기는 lib/supabase-keys 한 벌(next/headers 를 안 문다) · 화면 쪽 setAll 은 조용히 넘긴다 */
import { readFileSync, existsSync } from "node:fs";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
console.log("■ 세션 갱신 · 화면은 쿠키를 못 쓰니 미들웨어가 끝난 세션을 갱신해 되쓴다");
ok("middleware.js 가 뿌리에 있다", existsSync("middleware.js"));
const m = existsSync("middleware.js") ? strip(readFileSync("middleware.js", "utf8")) : "";
ok("createServerClient 로 요청 쿠키를 읽고(request.cookies.getAll) 갱신된 것을 응답에 쓴다(response.cookies.set) · 요청에도 다시 넣는다(뒤 화면이 새 것을 읽게)", /createServerClient\(/.test(m) && /request\.cookies\.getAll\(\)/.test(m) && /response\.cookies\.set\(/.test(m) && /request\.cookies\.set\(/.test(m));
ok("getSession 으로 끝난 때만 갱신 · auth.getUser 0(속도 대원칙 2) · 실패해도 던지지 않는다(try)", /auth\.getSession\(\)/.test(m) && !/auth\.getUser\s*\(/.test(m) && /try \{ await sb\.auth\.getSession\(\); \} catch \{\}/.test(m));
ok("정적 파일·크론·확장 API 는 안 건드린다(matcher)", /_next\/static/.test(m) && /api\/cron/.test(m) && /api\/cc/.test(m) && /svg\|png/.test(m));
ok("키 읽기는 lib/supabase-keys.js 한 벌 · 미들웨어는 next/headers 를 안 문다 · lib/supabase.js 도 그것을 쓴다", /from "\.\/lib\/supabase-keys\.js"/.test(m) && !/next\/headers/.test(m) && /from "\.\/supabase-keys\.js"/.test(readFileSync("lib/supabase.js", "utf8")));
ok("화면 쪽(lib/supabase.js) setAll 은 조용히 넘긴다(서버 컴포넌트는 쿠키를 못 쓴다 · 던지면 껍질이 메뉴 없이 그려진다)", /setAll: \(list\) => \{ try \{/.test(readFileSync("lib/supabase.js", "utf8")));
ok("껍질(app/layout.js)은 세션을 못 읽어도 화면을 죽이지 않는다(누구() 의 try) · 메뉴는 lib/menu 한 벌", /catch \{ return \{ me: null, rows: \[\] \}; \}/.test(readFileSync("app/layout.js", "utf8")) && /menuFor/.test(readFileSync("app/_shell/shell.js", "utf8")));
console.log(`\n■ 세션 갱신 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
