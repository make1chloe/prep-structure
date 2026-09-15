/** 오늘 01 은 설명하지 않는다 — 검사-87((어12) · 원장님 2026-09-13 「쓸데없는 설명을 빼고 직관적으로 기능을 파악하고 생각의 흐름에 따라 페이지를 따라가게 해야해」).
 *  2026-09-13 실측: 01 에 설명 55곳 1,786자 · 단추 이름 평균 21.1자 · 카드 차례가 아이마다 달랐다(🔤 가 앞뒤로 튐) · PC 도 960 한 줄. 다시 흩어지면 여기서 잡는다 — 글자 검사는 주석을 먼저 지운다(폰-5) */
import { readFileSync } from "node:fs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const row = strip(readFileSync("app/today/row.js", "utf8")), page = strip(readFileSync("app/today/page.js", "utf8")), board = strip(readFileSync("app/today/board.js", "utf8"));
const css = readFileSync("app/globals.css", "utf8");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const 한글 = (t) => t.replace(/[^가-힣]/g, "").length;
console.log("■ 01 은 설명하지 않는다. 이름이 말한다(대전제-15)");
ok("ⓘ Tip 0 · 접힌 설명도 설명이다", !/<Tip\b/.test(row));
const titles = [...row.matchAll(/<[a-z][^>]*\stitle=/g)].length;
ok("마우스 대면 뜨는 title= 0(html 요소) · 폰엔 마우스가 없다", titles === 0, String(titles));
// 설명 문장 — note·small·placeholder 안에서 「~합니다」로 끝나는 글. 상태 글(「메모 없음」「3/5 남음」「예: 워크북 p.10」)은 안 걸린다
const texts = [...row.matchAll(/(?:className="note[^"]*"[^>]*>|<small[^>]*>|placeholder="?)([^<{"]*)/g)].map((m) => m[1].trim()).filter(Boolean);
const explain = texts.filter((t) => /(합니다|됩니다|십시오|세요|입니다)[.)]?$/.test(t) || /(합니다|됩니다) · /.test(t));
ok(`note·small·placeholder 안의 「~합니다」 설명 문장 ≤ 4(지금 ${explain.length} · 2026-09-13 엔 이런 조각이 55곳 1,786자)`, explain.length <= 4, explain.map((t) => t.slice(0, 40)).join(" | "));
// 단추 글 — onClick={() => …} 안의 「>」에 속지 않게 중괄호 깊이를 세며 여는 태그 끝을 찾는다(9/13 의 첫 셈 「평균 21.1자」는 이걸 안 해서 틀린 수였다 — 여기서 바로 잰다)
const noExpr = (t) => { let o = "", d = 0; for (const ch of t) { if (ch === "{") d++; else if (ch === "}") { if (d > 0) d--; } else if (d === 0) o += ch; } return o; };   // {식} 은 겹쳐도 통째로 뺀다 — 글자로 적힌 이름만 센다
function labels(src) { const out = []; let i = 0; while ((i = src.indexOf("<button", i)) !== -1) { let j = i + 7, d = 0; for (; j < src.length; j++) { const ch = src[j]; if (ch === "{") d++; else if (ch === "}") d--; else if (ch === ">" && d === 0) break; } const end = src.indexOf("</button>", j); if (end === -1) break; out.push(noExpr(src.slice(j + 1, end)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()); i = end + 9; } return out; }
const btns = labels(row).filter((t) => 한글(t) >= 1);
const avg = btns.reduce((a, b) => a + b.length, 0) / btns.length, long = btns.filter((t) => t.length > 14);
ok(`단추 이름은 이름이다. 글자로 적힌 ${btns.length}개 평균 ≤ 9자(지금 ${avg.toFixed(1)}) · 14자 넘는 것 0(${long.length})`, avg <= 9 && long.length === 0, long.join(" | "));
console.log("■ 차례 · 기본은 생각의 흐름(① 숙제 봤나 → ② 오늘 뭐 하나 → ③ 다음 숙제 → ④ 끝) · 바꾸면 그 사람 것((어15) 끌기)");
const order = ["<CheckCard", "<WorkCard", "<AreaMemoCard", "<LateCard", "<CommentCard"].map((k) => row.indexOf(k));
ok("판 안 카드 차례 check → work(안에 areamemo · late 접이) → comment · 아이마다 다른 자리 없음(quizEnd 0 · data-pos 0 · quiz_pos 0)", order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && !/quizEnd|data-pos|quizPos|quiz_pos/.test(row), order.join(","));
ok("(어15) 차례는 끌어서 바꾼다. orderCards(…, pref) + 같은 조각 <CardOrder screen=\"today\"> · 번호는 선 자리 순(stepno {no} · {no + 1}) · 차례 읽기는 page.js 파도 안", /orderCards\(\[/.test(row) && /<CardOrder screen="today"/.test(row) && /className="stepno">\{no\}/.test(row) && /className="stepno">\{no \+ 1\}/.test(row) && /prefOf\(sb, me\.id, "today"\)/.test(page));
const check = row.slice(row.indexOf("function CheckCard("), row.indexOf("function CheckItem("));
ok("🔤 는 숙제 검사 카드 안 **맨 끝**(원장님 9/13 「차라리 무조건 단어를 숙제검사 마지막에 넣어」) · 📝 단원평가 · 🃏 클래스카드도 그 안(🃏 → 📝 → 🔤) · 제목 줄이 있는 것만 말한다", /<CcPart/.test(check) && /<UnitTestPart/.test(check) && /<QuizPart/.test(check) && check.lastIndexOf("<QuizPart") > check.lastIndexOf("<UnitTestPart") && check.lastIndexOf("<UnitTestPart") > check.lastIndexOf("<CcPart") && /has\.join/.test(check));
ok("루틴 11 에 🔤 자리 세그 0(설정이 아니라 기본값 · 대전제-14 · quiz_pos 를 읽는 여섯 파일은 check-quiz 가 본다)", !/quiz-pos/.test(strip(readFileSync("app/settings/routine/board.js", "utf8"))));
console.log("■ PC 부터 · 두 열(원장님 9/13 「pc부터 고쳐야되고」)");
ok("01 은 960 한 줄이 아니다. page.js 에 maxWidth: 960 없음 · Board(.split)가 반들을 감싼다", !/maxWidth: 960/.test(page) && /<Board initial=/.test(page) && /className="split"/.test(board));
ok("한 번에 한 아이 · 열림은 board.js 한 곳(useOpen) · row.js 에 defaultOpen 없음 · 브라우저 저장 0(폰-7)", /useOpen\(student\.id\)/.test(row) && !/defaultOpen/.test(row) && !/sessionStorage|localStorage/.test(row + board));
ok("목업에서 갈라낸 .split 규칙 · ≥1100px 두 열 · 판은 오른쪽 열(absolute) · 폰은 그대로(디자인-3)", /@media\s*\(min-width:\s*1100px\)\s*\{\s*\.split\{display:grid/.test(css) && /\.split \.row>\.panel\{[^}]*position:absolute/.test(css));
ok("저장줄은 판 안(rowbar 가 .panel 의 직접 자식 · PC 는 오른쪽 열 안에서 sticky)", /<div className="savebar rowbar" ref=\{setBarHost\} \/>\}\n\s*<\/div>\n\s*\)\}/.test(row));
// (어21) 3단 — 학생 · 업무 · 내용(원장님 2026-09-14 「pc화면을 3단으로 — 학생목록 - 업무목록 - 구체적내용」 · 「불편한거보다 창이 이동해서 화면이 예측불가능해지는게 더 불편」)
console.log("■ 3단 · 업무 목록은 카드 머리와 같은 글 · 고르면 오른쪽 속만 바뀐다 · 처음 여는 업무는 흐름에서 처음 안 끝난 것");
ok("업무 목록(nav.tasks · data-g=task · aria-pressed) + 몸(.tbody data-sel) + 「다음 →」(task-next) · 몸은 다 그려 두고 PC 는 고른 것만 보인다(상태·portal 이 안 끊긴다)", /<nav className="tasks" data-g="tasks"/.test(row) && /className="tbody" data-task=\{c\.id\} data-sel=/.test(row) && /data-act="task-next"/.test(row));
ok("처음 여는 업무는 lib/day-plan firstTask(검사가 남았으면 검사, 아니면 오늘 학습) · 한 번 정하면 저절로 안 옮긴다(useEffect 로 잠금 · 예측 가능)", /firstTask\(sheet\)/.test(row) && /useEffect\(\(\) => \{ if \(sheet && sel == null\) setSel\(firstTask\(sheet\)\)/.test(row));
ok("머리 글은 한 벌 · 검사 카드 제목과 업무 꼬리표가 같은 checkText·checkIcons(day-plan) · 내신 자료 꼬리표는 prepBadge(todo-plan)", (row.match(/checkText\(sheet\)/g) ?? []).length >= 2 && /checkIcons\(student\)/.test(row) && /prepBadge\(prepList\)/.test(row));
ok("업무 단추의 클래스는 .tk · CSS 가 .tk 로 있고(.tk · aria-pressed · .n · .tb) 아이 화면 카드 .task 에 nav 규칙이 안 섞였다(9/14 겹쳐서 카드가 flex 줄로 깨졌던 것)", /className=\{"tk" \+ \(h\.done \? " done" : ""\)\} data-g="task"/.test(row) && /\.tk\{display:flex/.test(css) && /\.tk\[aria-pressed="true"\]/.test(css) && /\.tk \.tb\{/.test(css) && !/\.task\{display:flex/.test(css));
ok("검사 ○△✕ 눌림이 눈에 보인다 — 단추 data-v 는 CHECK_KEY(o·w·x · 목업 01 과 같은 글자) · CSS 눌림 색 셋이 그 글자를 본다(9/15 「숙제검사 ox는 표시가 안되는데」: 앱이 d·w·m 을 내서 ○·✕ 만 색이 안 났다)", /data-v=\{CHECK_KEY\[v\]\}/.test(row) && !/data-v=\{v\[0\]\}/.test(row) && ["o", "w", "x"].every((k) => new RegExp(`\\.chk button\\[aria-pressed="true"\\]\\[data-v="${k}"\\]\\{`).test(css)));
const hw = readFileSync("lib/homework.js", "utf8");
ok("(어26) 항목은 더하고 고치고 빼는 것이 기본(대전제-19 · 원장님 9/15 「모든 항목을 추가/수정/삭제가 가능한게 기본」): 손으로 더한 줄에 ✎(item-edit)·✕(item-del)·되살리기(item-restore) · 루틴 줄·남 줄에도 ✕ · 손은 lib/homework editItemText·removeItem·restoreItem(마감을 본다 · 지우지 않고 off)", /data-act="item-edit"/.test(row) && (row.match(/data-act="item-del"/g) ?? []).length >= 3 && /data-act="item-restore"/.test(row) && /export async function editItemText/.test(hw) && /export async function removeItem/.test(hw) && /export async function restoreItem/.test(hw) && /update\(\{ off: true \}/.test(hw) && !/from\("day_item"\)\.delete/.test(hw));
ok("(어24) 업무는 끝나면 ✓(data-done · taskDone 한 곳) · 검사 「다 ○」(check-all) · 오늘 학습 접이(fold-more · fold-late · fold-memo · quiz-edit) · 글 「고치기」(comment-edit) · 「저장하고 마감 → 다음 아이」(onNext · useOpen nextOf)", /data-done=\{h\.done/.test(row) && /taskDone\(c\.id/.test(row) && /data-act="check-all"/.test(row) && ["fold-more", "fold-late", "fold-memo", "quiz-edit", "comment-edit"].every((a) => row.includes(`data-act="${a}"`)) && /onNext\?\.\(\)/.test(row) && /저장하고 마감 → 다음 아이/.test(row));
ok("목업에서 갈라낸 3단 규칙 · ≥1100px 판은 grid 두 열(업무 250 · 내용) · 안 고른 몸은 display:none · 폰은 업무 목록·다음 → 이 안 보인다", /\.split \.row>\.panel\{[^}]*grid-template-columns:250px/.test(css) && /\.split \.tbody:not\(\[data-sel="1"\]\)\{[^}]*display:none/.test(css) && /\.tasks\{display:none\}/.test(css) && /\.tnext\{display:none\}/.test(css));
ok("(어21) 📄 내신 자료는 업무 하나 · 교재가 멈춘 아이만(prepOf · stopOn 한 벌) · 판단·부품·손이 한 벌(PrepCard → todo-plan prepOf · _shell/scopeform · 04·06b 의 손)", /id: "prep", name: "내신 자료"/.test(row) && /filter\(\(c\) => c\.id !== "prep" \|\| prepList\.length > 0\)/.test(row) && /prepOf\(prep, date, stopOn\)/.test(row));
ok("(어13) 숙제 0 이면 「+ 숙제 주기」 단추 하나 → 모달(give-modal · lib/homework addItems 여러 줄) · 페이지에 늘 보이는 양식은 안 늘었다(항목 더하기 단추 2개 그대로 · 원장님 9/14 「기존 페이지에서 더 늘어나지않게」)", /data-act="give"/.test(row) && /data-g="give-modal"/.test(row) && /sheet\.home\.length === 0 &&/.test(row) && (row.match(/>항목 더하기<\/button>/g) ?? []).length === 2 && /export async function addItems/.test(strip(readFileSync("lib/homework.js", "utf8"))));
{ const routine = readFileSync("lib/routine.js", "utf8"), plan = readFileSync("lib/routine-plan.js", "utf8"), day = readFileSync("lib/day.js", "utf8");   // (어33) 원장님 9/15 「오늘 화면에 회차라는 단어 사용하지마」 · 「네 언어말고, 일반적인 학원선생님이 좀 알아들을 수 있는 말로」
  ok("(어33) 오늘 01 에 「회차」 0(단원 고르기는 「오늘 단원」 · 조절 알약은 「루틴 11 에서 고치기」) · 01 이 부르는 손의 오류 글에도 0(routine pickWave · day examsSoon)", !/회차/.test(row + page + board) && !/회차를 못 바꿈|회차 줄을 못 세움/.test(routine) && !/곧 있는 회차를 못 읽음/.test(day));
  ok("(어33) 조절 02 는 쉬운 말 · 「○○ 에서 아직 안 나간 소단원 N개 · 다음 대단원 ○○ 도 고를 수 있음」 · 「고른 소단원 N개 = 오늘 N문항 · N쪽」(둘 다 0이면 「문항·쪽 수가 교재에 없음」) · 「나가는 차례 · 대단원마다/소단원마다」 · 「1개면 N문항」 알약 0 · 칩 목록에 대단원 머리", /아직 안 나간 소단원/.test(row) && /도 고를 수 있음/.test(row) && /고른 소단원 \{selected\.length\}개 = 오늘/.test(row) && /문항·쪽 수가 교재에 없음/.test(row) && /나가는 차례/.test(row) && !/1개면/.test(row) && /data-g="tune-chapter"/.test(row));
  ok("(어33) 조절 판은 이 대단원 + 다음 대단원(tunePool chapters 둘 · inChapter) · 칩이 곧 고른 것(tuneStep · tuneCount · tuneSorted · 갯수·뺀 것 두 상태 없음 · tuneUnits 0)", /\)\]\.slice\(0, 2\)/.test(routine) && /inChapter:/.test(routine) && /export function tuneStep/.test(plan) && !/tuneUnits/.test(plan + row + routine) && !/excluded/.test(row)); }
console.log(`\n■ 오늘 01 말·차례·PC 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
