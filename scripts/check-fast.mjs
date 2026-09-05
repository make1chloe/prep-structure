/** 속도 검사(속도-상한 — 오늘 조회 20 · 4단). 층은 파도 밖 await 한 줄이 하나다 — 기능을 더할 때 제일 쉽게 무너진다(원장님 8/14 「모든 페이지의 로딩 자체가 느려」).
 *  글자로 보는 것: ① 화면(page.js)은 표를 직접 안 읽고 lib 만 부른다 ② 화면 머리의 await 수(= 층) 상한 ③ lib 의 판 여는 길에 파도(Promise.all)가 남아 있나.
 *  조회 수 자체는 눌러보기(e2e/today.mjs)가 PostgREST 요청 로그로 센다. 상한에 걸리면 조회를 파도에 태우는 것이 답이지 상한을 올리는 것이 답이 아니다 */
import { readFileSync } from "node:fs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const bad = [];
// [화면, 층 상한(머리의 await 수), 까닭]
const CAPS = [["app/today/page.js", 3, "로그인 확인 · 오늘 · 판(반·아이 → 판) = 4단"]];
for (const [f, cap, why] of CAPS) {
  const s = strip(readFileSync(f, "utf8"));
  if (/\bdb\(|\.from\(|\.rpc\(/.test(s)) bad.push(`${f}: 표를 직접 읽는다 — 판단은 lib 한 벌(대전제-4)`);
  const n = (s.match(/\bawait\b/g) ?? []).length;
  if (n > cap) bad.push(`${f}: await ${n}개 (상한 ${cap} — ${why}). 조회를 lib 의 파도에 태우세요, 상한을 올리지 말고`);
}
const day = strip(readFileSync("lib/day.js", "utf8"));
if (!/Promise\.all\(/.test(day)) bad.push("lib/day.js: 파도(Promise.all)가 사라졌다 — 판 세우기 ∥ 지난 숙제 ∥ 검사한 것");
if (!/\bfunction roster\b/.test(day)) bad.push("lib/day.js: roster() 가 없다 — 화면이 조회를 제 손으로 하게 된다");
if (!/\bawait\b/.test(strip("// x\nconst a = await b();"))) { console.log("⚠️ 검사 자신이 고장났다"); process.exit(1); }
if (bad.length) { console.log("check-fast ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-fast ✓ 화면 ${CAPS.length} — 표 직접 읽기 0 · 층 상한 안 · lib/day 파도 있음`);
