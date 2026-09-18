/** 빠른 게이트 자신을 지키는 검사(원장님 2026-09-18 「ⓐ 지금 지어 둔다」 · 원칙 6).
 *  빠른 게이트(scripts/gate.mjs)가 조용히 쓸모없어지는 길이 셋이라 그 셋을 막는다:
 *   ① 갈래를 **손으로 적은 목록**으로 바꾸면 새 파수꾼이 조용히 빠진다 → 파일이 스스로 말하게 둔다
 *   ② 건너뛴 것을 **안 적으면** 「다 돌았다」로 읽힌다(대전제-0)
 *   ③ 「푸시 전에는 통째로」를 빼면 빠른 게이트가 통째 게이트를 **대신하게** 된다 */
import { readFileSync, readdirSync } from "node:fs";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const g = readFileSync("scripts/gate.mjs", "utf8");
const checks = readdirSync("scripts").filter((f) => /^check-.*\.mjs$/.test(f));

console.log("■ 빠른 게이트 — 갈래는 파일이 스스로 말한다 · 건너뛴 것을 적는다 · 통째 게이트를 대신하지 않는다");
ok(`파수꾼 갈래를 **읽어서** 나눈다(손으로 적은 목록이 아니다) · 지금 ${checks.length}종`,
   /readdirSync\("scripts"\)\.filter\(\(f\) => \/\^check-\.\*\\\.mjs\$\/\.test\(f\)\)/.test(g) && /const needsDb = /.test(g) && /const needsBrowser = /.test(g));
ok("DB·브라우저가 필요한지를 **파일 속 글자**로 가른다(DATABASE_URL · pg · _browser.mjs)",
   /DATABASE_URL\|from "pg"\|_ap\\\.mjs/.test(g) && /_browser\\\.mjs/.test(g));
ok("건너뛴 것을 **큰 소리로 적는다**(대전제-0 — 안 돈 것을 돌았다고 말하지 않는다)", /건너뛴\.push/.test(g) && (g.match(/건너뛴\.push/g) ?? []).length >= 4 && /⚠️ 건너뛴/.test(g));
ok("**푸시 전에는 통째로 한 번**이라고 못 박는다(빠른 게이트가 통째 게이트를 대신하지 않는다)",
   (g.match(/푸시 전에는 통째로/g) ?? []).length >= 2 && /scripts\/e2e\/run\.sh/.test(g));
ok("글자 파수꾼이 터지면 **거기서 멈춘다**(25분을 쓰기 전에 11초로 잡는다)", /if \(fails\.length\) \{[\s\S]{0,200}?process\.exit\(1\)/.test(g));
ok("바뀐 파일은 git 이 말한다(짐작하지 않는다)", /git status --porcelain/.test(g) && /git diff --name-only/.test(g));
ok("앱·목업이 안 바뀌었으면 **빌드를 건너뛴다**(오늘 아홉 번 중 여섯 번이 걷기 글자만 고친 것이었다)", /const doBuild = !QUICK && \(앱 \|\| 목업\)/.test(g));
ok("DB 자리가 서 있으면 **다시 안 세운다**(up.sh 는 매번 DB 를 통째로 지우고 다시 만든다)", /const dbUp = alive\(/.test(g) && /const doUp = !QUICK && !dbUp/.test(g));
ok("걷기 today 는 screens 가 남긴 로그인 상태를 쓴다 — 상태 파일이 없으면 screens 를 먼저 돈다", /state-student\.json/.test(g) && /state-parent\.json/.test(g));
console.log(`\n■ 빠른 게이트 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
