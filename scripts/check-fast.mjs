/** 속도 검사(속도-상한 — 오늘 조회 20 · 4단). 층은 파도 밖 await 한 줄이 하나다 — 기능을 더할 때 제일 쉽게 무너진다(원장님 8/14 「모든 페이지의 로딩 자체가 느려」).
 *  글자로 보는 것: ① 화면(page.js)은 표를 직접 안 읽고 lib 만 부른다 ② 화면 머리의 await 수(= 층) 상한 ③ lib 의 판 여는 길에 파도(Promise.all)가 남아 있나.
 *  조회 수 자체는 눌러보기(e2e/today.mjs)가 PostgREST 요청 로그로 센다. 상한에 걸리면 조회를 파도에 태우는 것이 답이지 상한을 올리는 것이 답이 아니다 */
import { readFileSync } from "node:fs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const bad = [];
// [화면, 층 상한(머리의 await 수), 까닭]
const CAPS = [["app/today/page.js", 3, "로그인 확인 · 오늘 · 판(반·아이 → 판) = 4단"], ["app/page.js", 3, "로그인 확인 · 오늘 · 대시보드(반·아이 → 나머지 파도) = 5단"], ["app/me/page.js", 3, "로그인 확인 · 오늘 · 내 하루(제 학생 줄 → 파도) = 4단"], ["app/me/cal/page.js", 4, "로그인 확인 · 주소 인자 · 오늘∥학생 줄 · 달력 파도 = 4단"], ["app/parent/page.js", 4, "로그인 확인 · 주소 인자 · 오늘∥아이들 · 고른 아이 파도(최근 판 있을 때 시험 하나 더) = 5단"], ["app/parent/cal/page.js", 4, "로그인 확인 · 주소 인자 · 오늘∥아이들 · 달력 파도 = 4단"], ["app/send/page.js", 3, "로그인 확인 · 오늘 · 발송 파도(2 — 오늘 판 · send_board 한 벌) = 3단 — 백스톱은 렌더 뒤(after)"], ["app/settings/routine/page.js", 4, "로그인 확인 · 주소 인자 · 오늘 · 루틴 판 한 벌(routine_board) = 4단"], ["app/schedule/page.js", 4, "로그인 확인 · 주소 인자 · 오늘 · 일정 판 한 벌(schedule_board) = 4단"], ["app/schedule/import/page.js", 3, "로그인 확인 · 오늘 · 받아오기 판 한 벌(import_board) = 3단"], ["app/ops/page.js", 4, "로그인 확인 · 주소 인자 · 오늘 · 수강료 판 한 벌(fee_board) = 4단"], ["app/schedule/exams/page.js", 3, "로그인 확인 · 오늘 · 시험 회차 판 한 벌(exam_board) = 3단"], ["app/scores/page.js", 4, "로그인 확인 · 주소 인자 · 오늘 · 성적 판 한 벌(score_board) = 4단"], ["app/books/page.js", 4, "로그인 확인 · 주소 인자 · 오늘 · 교재 판 한 벌(book_board) = 4단"], ["app/schedule/exams/prep/page.js", 4, "로그인 확인 · 주소 인자 · 오늘 · 내신 자료 판 한 벌(prep_board) = 4단"], ["app/schedule/todo/page.js", 3, "로그인 확인 · 오늘 · 할 일 판 한 벌(todo_board — 오늘 되풀이가 안 돌았으면 lib 안에서 한 번 더) = 3단"], ["app/me/book/page.js", 4, "로그인 확인 · 주소 인자 · 오늘∥제 학생 줄 · 로드맵 판 한 벌(road_board — 교재를 안 고르면 lib 안에서 첫 교재로 한 번 더) = 4단"], ["app/settings/progress/page.js", 3, "로그인 확인 · 오늘 · 진도 체크 판 한 벌(progress_board) = 3단"], ["app/schedule/grid/page.js", 4, "로그인 확인 · 주소 인자 · 오늘 · 표 판 한 벌(grid_board) = 4단"], ["app/ops/students/page.js", 4, "로그인 확인 · 주소 인자 · 오늘 · 학생 판 한 벌(student_board) = 4단"], ["app/ops/inquiry/page.js", 3, "로그인 확인 · 오늘 · 문의 판 한 벌(inquiry_board) = 3단"], ["app/ops/files/page.js", 3, "로그인 확인 · 오늘 · 자료함 판 한 벌(file_board) = 3단"], ["app/books/videos/page.js", 3, "로그인 확인 · 오늘 · 영상 판 한 벌(video_board) = 3단"], ["app/me/videos/page.js", 4, "로그인 확인 · 주소 인자 · 오늘∥제 학생 줄 · 배정∥구간∥규칙 = 4단"]];
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
const dash = strip(readFileSync("lib/dash.js", "utf8"));
if ((dash.match(/Promise\.all\(/g) ?? []).length < 1) bad.push("lib/dash.js: 파도(Promise.all)가 사라졌다 — 대시보드 조회가 층으로 쌓인다");
if (bad.length) { console.log("check-fast ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-fast ✓ 화면 ${CAPS.length} — 표 직접 읽기 0 · 층 상한 안 · lib/day·dash 파도 있음`);
