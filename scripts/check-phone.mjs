/** 폰·속도 규칙의 글자 검사(끝의 정의 「지킴: —」 0) — 폰-2 autoFocus 0 · 폰-4 당김 새로고침(overscroll-behavior) · 폰-5 글자 검사는 주석을 먼저 지운다 · 폰-7·속도-6 임시저장은 DB 판(브라우저 저장은 배색뿐) · 폰-8 scroll-margin-top · 속도-2 껍질은 배지·표를 안 읽는다 · 속도-5 낙관 갱신은 출결·○△✕ 자리뿐(useOptimistic 0) · 처음-7 코드가 읽는 환경변수는 다섯뿐(바깥 서비스 열쇠는 v2.integration 표에).
 *  글자로 훑는다 — 주석을 먼저 지운다(폰-5) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const src = [...files("lib"), ...files("app")].map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const css = readFileSync("app/globals.css", "utf8");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const where = (re) => src.filter(([, s]) => re.test(s)).map(([p]) => p);
console.log("■ 폰 규칙(글자)");
ok("폰-2 열릴 때 autoFocus 를 안 건다(앱 전체 0)", where(/\bautoFocus\b/).length === 0, where(/\bautoFocus\b/).join(", "));
ok("폰-4 당김 새로고침이 적던 것을 안 날린다. body{overscroll-behavior-y:contain}(목업 규칙에서 갈라낸 것)", /body\{[^}]*overscroll-behavior-y:contain/.test(css));
ok("폰-8 줄을 열고 닫을 때 목록 자리를 지킨다. .row{scroll-margin-top}", /\.row\{[^}]*scroll-margin-top/.test(css));
ok("폰-1 입력칸 글씨 16 은 기계(pointer:coarse)로 가른다. 본문 토큰 --fs-5 를 16px 로 올리는 미디어 규칙에 (pointer:coarse) 가 있다(폭만 보면 아이패드 768 이 빠진다 · 크기 자체는 check-fonts 가 브라우저에서 잰다)", /@media\s*\([^{]*max-width[^{]*\)\s*,\s*\(pointer:\s*coarse\)\s*\{\s*:root\s*\{[^}]*--fs-5:\s*16px/.test(css), "globals.css 에 @media(max-width:…),(pointer:coarse){:root{--fs-5:16px}} 가 없다");
const ls = src.flatMap(([p, s]) => [...s.matchAll(/(localStorage|sessionStorage)\.(getItem|setItem)\(\s*["']([^"']+)["']/g)].map((m) => `${p}:${m[3]}`));
ok("폰-7·속도-6 임시저장은 DB 판(day_sheet)에 · 브라우저 저장은 배색(chloe-skin)뿐이라 당김 새로고침·새 버전 띠가 적던 것을 못 날린다", ls.every((k) => k.endsWith(":chloe-skin")), ls.join(", "));
const checks = readdirSync("scripts").filter((f) => /^check-.*\.mjs$/.test(f)).map((f) => [f, readFileSync(join("scripts", f), "utf8")]);
const reads = checks.filter(([, s]) => /readFileSync\(["'](lib|app)\/[^"']+\.js["']/.test(s) || /files\(["'](lib|app)["']\)/.test(s));
const noStrip = reads.filter(([, s]) => !/strip\(|replace\(\/\\\/\\\*\[\\s\\S\]\*\?\\\*\\\/\/g/.test(s)).map(([f]) => f);
ok(`폰-5 lib·app 글자를 훑는 검사 ${reads.length}개는 주석을 먼저 지운다(strip)`, noStrip.length === 0, noStrip.join(", "));
console.log("■ 속도 규칙(글자)");
const layout = strip(readFileSync("app/layout.js", "utf8"));
ok("속도-2 껍질(app/layout.js)은 배지를 안 센다. rpc 0 · 읽는 것은 메뉴 권한 하나(accessQuery · lib/access.js 한 곳, (서2))", !/\.rpc\(/.test(layout) && (layout.match(/\.from\(/g) ?? []).length === 0 && (layout.match(/accessQuery\(/g) ?? []).length === 1, `from ${(layout.match(/\.from\(/g) ?? []).length} · accessQuery ${(layout.match(/accessQuery\(/g) ?? []).length}`);
const shell = src.filter(([p]) => p.startsWith("app/_shell/")).filter(([, s]) => /db\(|\.rpc\(|\.from\(/.test(s)).map(([p]) => p);
ok("속도-2 껍질 부품(app/_shell/*)은 표를 안 읽는다", shell.length === 0, shell.join(", "));
ok("속도-5 useOptimistic 0 · 낙관 갱신은 손으로 되돌리는 자리(출결 · ○△✕ · 진도)뿐", where(/useOptimistic/).length === 0, where(/useOptimistic/).join(", "));
const optimisticNotes = src.filter(([, s]) => /낙관/.test(s)).map(([p]) => p);   // 주석은 지웠으니 코드 안의 「낙관」(글자·이름)만
ok("속도-5 낙관이 코드 글자로 남은 자리 0(판단은 lib · 되돌릴 수 없는 마감·발송·파기는 서버 답을 기다린다. e2e 가 새로고침 뒤 상태로 본다)", optimisticNotes.length === 0, optimisticNotes.join(", "));
console.log("■ 처음 규칙(글자)");
const ENV = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NOTIFY_SINK", "CRON_SECRET"]);
const envs = [...new Set(src.flatMap(([, s]) => [...s.matchAll(/(?:process\.env|\benv)\.([A-Z][A-Z0-9_]{3,})/g)].map((m) => m[1])))];
ok(`처음-7 코드가 읽는 환경변수는 ${ENV.size}뿐(로그인 열쇠 둘 · 서버 열쇠 · 스위치 · 크론 열쇠) · 바깥 서비스 계정(푸시·AI·나이스·학원)은 v2.integration 표에`, envs.every((e) => ENV.has(e)), "밖의 것: " + envs.filter((e) => !ENV.has(e)).join(", "));
console.log("■ (어17) 아이·학부모 화면 · PC 최대 너비 · 폰 한 줄(원장님 9/14 「아이들 화면을 원내에서도 접속시켜서 pc에서는 최대너비로 보이게, 폰에서는 한줄로 보이게」)");
const kidPages = ["app/me/page.js", "app/me/book/page.js", "app/me/videos/page.js", "app/me/cal/page.js", "app/parent/page.js", "app/parent/cal/page.js"].map((f) => [f, readFileSync(f, "utf8")]);
ok("07·08·19·달력·09 틀은 1400(01 과 같은 최대 너비) · 560·720 없음", kidPages.every(([, s]) => /maxWidth: 1400/.test(s) && !/maxWidth: (560|720)\b/.test(s)), kidPages.filter(([, s]) => !/maxWidth: 1400/.test(s)).map(([f]) => f).join(", "));
ok("목업 CSS · PC(≥1100) .mine 두 열(column-count · 카드는 안 쪼갠다) · 08 세 열은 폭을 나눠 갖고 폰(≤760)은 한 줄로 쌓는다(하는 중 먼저) · 달력은 PC 에서 달력 왼쪽 · 그날 카드 오른쪽", /@media\(min-width:1100px\)\{\s*\.frame:not\(\.phone\) \.mine\{display:block;column-count:2/.test(css) && /\.frame:not\(\.phone\) \.mine \.task\{break-inside:avoid\}/.test(css) && /\.rcol\{flex:1 1 200px/.test(css) && /@media\(max-width:760px\)\{\s*\.road\{flex-direction:column/.test(css) && /\.rcol\[data-g="col-doing"\]\{order:-1\}/.test(css) && /\.calpage\{display:grid/.test(css));

console.log("■ (어19) 학원 화면 PC · 틀 1400 · 카드 목록 화면은 두 열(원장님 9/14 「오늘, 일정, 교재, 페이지를 제외하고는 여전히 pc에서 배치가 비효율적이야」)");
const w1100 = src.filter(([p, s]) => /^app\//.test(p) && /maxWidth: 1100\b/.test(s)).map(([p]) => p);
ok("학원 화면 틀 1100 은 0 · 전부 1400(01·아이 화면과 같은 최대 너비)", w1100.length === 0, w1100.join(", "));
const colsPages = ["app/send/page.js", "app/send/monthly/page.js", "app/send/notice/page.js", "app/ops/files/page.js", "app/books/videos/page.js", "app/schedule/classes/page.js", "app/settings/page.js"];
ok("카드 목록 화면 일곱(발송 · 월간 · 공지 · 자료함 · 영상 배정 · 반 · 설정)은 frame.cols · 목업 CSS 가 PC 두 열로 흘린다(머리줄·저장줄·모달은 걸침)", colsPages.every((f) => /className="frame cols"/.test(readFileSync(f, "utf8"))) && /@media\(min-width:1100px\)\{\s*\.frame\.cols\{column-count:2/.test(css) && /\.frame\.cols>\.mdlov\{column-span:all\}/.test(css), colsPages.filter((f) => !/className="frame cols"/.test(readFileSync(f, "utf8"))).join(", "));

console.log(`\n■ 폰·속도 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
