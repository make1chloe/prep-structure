/** 문서 숫자 검사(대전제-0 「숫자는 센 것만 쓴다 · 어디서 셌는지 밝힌다」 · 2026-09-07 개발자 지적) — docs/개발자-인수인계.md 「한 장 요약」의 숫자를 그 「근거」 칸에 적힌 셈법 그대로 다시 세어 대조한다. 문서가 코드보다 늦으면 빨개진다.
 *  글자로 셀 수 있는 것만 센다: 마이그레이션 파일 · 0100~ 개수 · 판(*_board 이름 — 다시 낸 것은 하나로) · lib 모듈(판단/손) · 화면·주소 · 검사 종 · 규칙(「지킴:」 줄 · 「지킴: —」) · 목업 화면 수(목업 h2 · README · 인수인계 · check-mockup 주석 — 넷이 같아야 한다) · 4절 머리의 모듈 수.
 *  본문의 「0100~NNNN」 범위는 어디에 적혔든 마지막 번호여야 한다(3절 붙여넣기 · 7절 답 · 9절 체크리스트 — 요약만 고치고 본문을 안 고친 채 나간 일이 있었다).
 *  DB·눌러보기 숫자(함수·정책 · 통과/실패 · 걷기)는 여기서 못 세므로 **건너뜀**으로 센다(초록이 아니다 — check-all 과 게이트가 그 자리를 맡는다).
 *  쓰기: node scripts/check-doc-numbers.mjs [인수인계 경로] — 경로를 주면 그 파일을 본다(일부러 틀린 사본으로 빨개지는 것을 보일 때) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const docPath = process.argv[2] ?? "docs/개발자-인수인계.md";
const doc = readFileSync(docPath, "utf8"), rules = readFileSync("docs/규칙.md", "utf8"), mock = readFileSync("docs/목업/클로이영어-화면-목업.html", "utf8"), readme = readFileSync("docs/목업/README.md", "utf8"), chk = readFileSync("scripts/check-mockup.mjs", "utf8");
let n = 0, bad = 0, skip = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const pass = (what, why) => { skip++; console.log(`   ⏭  ${what} — ${why}`); };
const grab = (re, what) => { const m = re.exec(doc); if (!m) { n++; bad++; console.log(`   ❌ 문서에서 줄을 못 찾음 — ${what}: ${re}`); return null; } return m.slice(1).map((x) => (/^0\d{3}$/.test(x) ? x : Number(x))); };   // 0138 같은 번호는 글자 그대로
const walk = (dir, name, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, name, out); else if (f === name) out.push(p); } return out; };
// ── 실측
const migs = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
const m0 = migs.filter((f) => /^0\d{3}_/.test(f)), m01 = migs.filter((f) => /^01\d{2}_/.test(f)), last01 = m01.at(-1).slice(0, 4);
const boards = new Set(); for (const f of m01) for (const m of readFileSync("supabase/migrations/" + f, "utf8").matchAll(/function v2\.([a-z_]*_board)\(/g)) boards.add(m[1]);
const libs = readdirSync("lib").filter((f) => f.endsWith(".js")), plans = libs.filter((f) => f.endsWith("-plan.js"));
const pages = walk("app", "page.js").length, routes = walk("app", "route.js").length;
const checks = readdirSync("scripts").filter((f) => /^check-.*\.mjs$/.test(f)).length;
const keep = (rules.match(/\*\*지킴:\*\*/g) ?? []).length, dash = (rules.match(/\*\*지킴:\*\* —/g) ?? []).length;
const screens = (mock.match(/<section[^>]*\bid="s\d+[a-z]?"/g) ?? []).length;   // 화면 = id 가 s+번호(+글자)인 section — notes·audit·sim·rules 는 화면이 아니다
console.log(`■ 실측 — 마이그레이션 ${migs.length}(0xxx ${m0.length} · 01xx ${m01.length} · 마지막 ${last01}) · 판 ${boards.size} · lib ${libs.length}(판단 ${plans.length}) · 화면 ${pages} · 주소 ${routes} · 검사 ${checks} · 규칙 지킴 ${keep}(— ${dash}) · 목업 화면 ${screens}`);
console.log("■ 인수인계 「한 장 요약」");
let v;
if ((v = grab(/\| 마이그레이션 파일 \| \*\*(\d+)\*\* = 0001~(\d{4}) \*\*(\d+)\*\*/, "마이그레이션 파일"))) ok(`마이그레이션 파일 ${v[0]} = 0001~${v[1]} ${v[2]} + 전환일 2`, v[0] === migs.length && v[1] === last01 && v[2] === m0.length, `실측 ${migs.length} = 0001~${last01} ${m0.length}`);
if ((v = grab(/\| 새 앱이 더한 것 \| \*\*0100~(\d{4}) · (\d+)개\*\*/, "새 앱이 더한 것"))) ok(`새 앱이 더한 것 0100~${v[0]} · ${v[1]}개`, v[0] === last01 && v[1] === m01.length, `실측 0100~${last01} · ${m01.length}개`);
if ((v = grab(/\| 판 한 벌\(`\*_board` rpc\) \| \*\*(\d+)\*\*/, "판 한 벌"))) ok(`판 한 벌 ${v[0]}(이름으로 · 다시 낸 것은 하나로)`, v[0] === boards.size, `실측 ${boards.size}: ${[...boards].sort().join(" ")}`);
if ((v = grab(/\| `lib\/` 모듈 \| \*\*(\d+)\*\* — 판단\(`\*-plan\.js` 순수 셈\) (\d+) \+ 손·조회 (\d+)/, "lib 모듈"))) ok(`lib 모듈 ${v[0]} = 판단 ${v[1]} + 손·조회 ${v[2]}`, v[0] === libs.length && v[1] === plans.length && v[2] === libs.length - plans.length, `실측 ${libs.length} = ${plans.length} + ${libs.length - plans.length}`);
if ((v = grab(/\| 화면 \| \*\*(\d+)\*\*\(/, "화면"))) ok(`화면 ${v[0]}(page.js)`, v[0] === pages, `실측 ${pages}`);
if ((v = grab(/주소 \*\*(\d+)\*\*\(`route\.js`\)/, "주소"))) ok(`주소 ${v[0]}(route.js)`, v[0] === routes, `실측 ${routes}`);
if ((v = grab(/\| 검사 \| \*\*(\d+)종\*\*/, "검사"))) ok(`검사 ${v[0]}종(scripts/check-*.mjs)`, v[0] === checks, `실측 ${checks}`);
if ((v = grab(/\| 규칙 \| \*\*(\d+)\*\*/, "규칙"))) ok(`규칙 ${v[0]}(규칙.md 「지킴:」 줄)`, v[0] === keep, `실측 ${keep}`);
if ((v = grab(/「지킴: —」 \*\*(\d+)\*\*/, "지킴: —"))) ok(`「지킴: —」 ${v[0]}`, v[0] === dash, `실측 ${dash}`);
{ // 규칙.md 제 머리의 세 숫자도 같이 본다 — 2026-09-03 의 「123 중 52 · 71 없음」이 넉 달 낡은 채 서 있었다(2026-09-11)
  const h = /규칙 \*\*(\d+)개 중 지키는 검사가 있는 것은 (\d+)개\*\*,\n> \*\*(\d+)개는 아직 없다/.exec(rules);
  ok(`규칙.md 머리 「${h?.[1] ?? "?"}개 중 ${h?.[2] ?? "?"} · ${h?.[3] ?? "?"} 없음」 = 지킴 ${keep} · ${keep - dash} · — ${dash}`,
     !!h && Number(h[1]) === keep && Number(h[2]) === keep - dash && Number(h[3]) === dash, `실측 ${keep} · ${keep - dash} · ${dash}`); }
{ // 인수인계 8절 「남긴 것」의 지킴 없는 수도 한 장 요약과 같아야 한다(둘이 17·13 으로 갈렸다 — 같은 날)
  const g = /지킴 없는 \*{0,2}(\d+)\*{0,2}/.exec(doc);
  ok(`인수인계 8절 「지킴 없는 ${g?.[1] ?? "?"}」 = 한 장 요약의 「지킴: —」 ${dash}`, !!g && Number(g[1]) === dash, `실측 ${dash}`); }
{ const ids = [...rules.matchAll(/^\| \*\*([^*|]+)\*\* \|/gm)].map((m) => m[1]); const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))]; ok(`규칙 번호가 겹치지 않는다(${ids.length}개 — 번호로 부르는 규칙이라 겹치면 다른 것을 가리킨다 · 확정-64 가 둘이던 것을 2026-09-09 에 잡음)`, dup.length === 0, "겹침: " + dup.join(" ")); }
if ((v = grab(/\| 목업 \| (\d+)화면/, "목업"))) ok(`목업 ${v[0]}화면(인수인계)`, v[0] === screens, `실측 ${screens}(section id=s…)`);
if ((v = grab(/## 4\. 판단은 `lib\/` 한 곳 — 모듈 (\d+)/, "4절 머리"))) ok(`4절 머리 「모듈 ${v[0]}」`, v[0] === libs.length, `실측 ${libs.length}`);
console.log("■ 인수인계 본문 — 「0100~NNNN」 은 어디에 적혔든 마지막 번호다(한 장 요약만 고치고 3절·7절·9절을 안 고친 채 나간 일 — 2026-09-07)");
const ranges = [...doc.matchAll(/0100~\*{0,2}(0\d{3})/g)].map((m) => m[1]), stale = ranges.filter((x) => x !== last01);
ok(`인수인계의 「0100~NNNN」 ${ranges.length}곳 모두 ${last01}`, ranges.length > 0 && stale.length === 0, stale.length ? `낡은 것 ${stale.length}곳: ${stale.join(" ")}` : "한 곳도 없음");
console.log("■ 목업 화면 수 — 넷이 같아야 한다(목업 h2 · README · check-mockup 주석 · 인수인계)");
const h2 = /<h2><span class="hemo">🔎<\/span>[^<]*— 화면 (\d+)개<\/h2>/.exec(mock), rd = /(\d+)화면\(s0~s\d+\)/.exec(readme), cm = /목업 (\d+)화면/.exec(chk);
ok(`목업 h2 「화면 ${h2?.[1] ?? "?"}개」 · README ${rd?.[1] ?? "?"}화면 · check-mockup 주석 ${cm?.[1] ?? "?"}화면 = ${screens}`, Number(h2?.[1]) === screens && Number(rd?.[1]) === screens && Number(cm?.[1]) === screens, `실측 ${screens}`);
ok("목업 뒷장 이름은 「만들 수 있나」다(「구현 점검」이면 0개 = 다 됐다로 읽힌다 — 현황은 인수인계 §5 한 곳만 말한다)", /만들 수 있나/.test(h2?.[0] ?? "") && !/구현 점검/.test(mock), h2?.[0] ?? "h2 없음");
console.log("■ 여기서 못 세는 것 — 건너뜀(초록 아님)");
pass("v2 함수 · 정책 · 판 수(DB)", "check-all 이 눌러보기 DB 에서 센다(check-tables · check-grants)");
pass("검사 결과 통과/실패 · 빌드", "check-all 의 합계 줄");
pass("눌러보기 걷기 수(화면 · 오늘 수업)", "bash scripts/e2e/run.sh 의 「걷기 N건」");
console.log(`\n■ 문서 숫자 검사 ${n}건 · 실패 ${bad} · 건너뜀 ${skip}`);
process.exit(bad ? 1 : 0);
