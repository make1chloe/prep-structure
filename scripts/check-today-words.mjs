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
// (어51) 원장님 2026-09-16 「아이콘 자체가 너무 시각적으로 빈약해. 아이콘으로만 정보를 표시한경우에는 툴팁이라고하나,그런걸로 마우스를 대고 있으면 다음시간으로 미루기, 같이 설명을 띄워」
//  → 마우스 대면 뜨는 글을 아주 안 쓰던 규칙((어12) 대전제-15)을 여기서 한 자리만 연다: **아이콘만 있는 손**. 글이 보이는 자리에는 여전히 안 붙이고, 아이콘 손은 icon() 한 벌로만 단다(app/_shell/icon.js · 이름·툴팁이 한 벌이라 어긋나지 않는다 · 폰에서는 aria-label 이 같은 말을 읽는다)
const titles = [...row.matchAll(/<[a-z][^>]*\stitle=/g)].length, icons = [...row.matchAll(/\{\.\.\.icon\(/g)].length;
ok(`마우스 대면 뜨는 title= 은 손으로 안 붙인다(지금 ${titles}) · 아이콘만 있는 손은 icon() 한 벌로 이름·툴팁(지금 ${icons}곳 · ○△✕ 도 CHECK_TIP 로 「다시 누르면 해제」까지 말한다)`, titles === 0 && icons >= 20 && /icon\(CHECK_NAME\[v\], CHECK_TIP\[v\]\)/.test(row), `title ${titles} · icon ${icons}`);
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
ok("(어26) 항목은 더하고 고치고 빼는 것이 기본(대전제-19 · 원장님 9/15 「모든 항목을 추가/수정/삭제가 가능한게 기본」): 손으로 더한 줄에 ✎(item-edit)·✕(item-del)·복구(item-restore) · 루틴 줄·남 줄에도 ✕ · 손은 lib/homework editItemText·removeItem·restoreItem(마감을 본다 · 지우지 않고 off)", /data-act="item-edit"/.test(row) && (row.match(/data-act="item-del"/g) ?? []).length >= 3 && /data-act="item-restore"/.test(row) && /export async function editItemText/.test(hw) && /export async function removeItem/.test(hw) && /export async function restoreItem/.test(hw) && /update\(\{ off: true \}/.test(hw) && !/from\("day_item"\)\.delete/.test(hw));
ok("(어24) 업무는 끝나면 ✓(data-done · taskDone 한 곳) · 검사 「다 ○」(check-all) · 오늘 학습 접이(fold-more · fold-late · fold-memo · quiz-edit) · 글 「고치기」(comment-edit) · 「저장하고 마감 → 다음 아이」(onNext · useOpen nextOf)", /data-done=\{h\.done/.test(row) && /taskDone\(c\.id/.test(row) && /data-act="check-all"/.test(row) && ["fold-more", "fold-late", "fold-memo", "quiz-edit", "comment-edit"].every((a) => row.includes(`data-act="${a}"`)) && /onNext\?\.\(\)/.test(row) && /저장하고 마감 → 다음 아이/.test(row));
ok("목업에서 갈라낸 3단 규칙 · ≥1100px 판은 grid 두 열(업무 250 · 내용) · 안 고른 몸은 display:none · 폰은 업무 목록·다음 → 이 안 보인다", /\.split \.row>\.panel\{[^}]*grid-template-columns:250px/.test(css) && /\.split \.tbody:not\(\[data-sel="1"\]\)\{[^}]*display:none/.test(css) && /\.tasks\{display:none\}/.test(css) && /\.tnext\{display:none\}/.test(css));
ok("(어21) 📄 내신 자료는 업무 하나 · 교재가 멈춘 아이만(prepOf · stopOn 한 벌) · 판단·부품·손이 한 벌(PrepCard → todo-plan prepOf · _shell/scopeform · 04·06b 의 손)", /id: "prep", name: "내신 자료"/.test(row) && /filter\(\(c\) => c\.id !== "prep" \|\| prepList\.length > 0\)/.test(row) && /prepOf\(prep, date, stopOn\)/.test(row));
ok("(어59) 검사 카드에서 연 배정은 **「이미 해왔어야 하는 숙제」**(원장님 9/16 「숙제검사에서 배정한 숙제는 오늘 집에가서 해올 숙제가 아니라, 이미 해왔어야하는 숙제라는 점이 반영안됨」) — give-here 는 check 자리로 열고 · 제목과 세그가 다르고 · 검사 줄에는 원본(carry_of)을 안 붙인다 · 검사 자리 활동은 집 루틴 그대로",
  /setGiveHere\("check"\)/.test(row) && /at === "check" \? \[\["check", "지난 숙제"\]\]/.test(row) && /at === "check" \? "검사할 숙제 배정"/.test(row)
  && (() => { const r = strip(readFileSync("lib/routine.js", "utf8")); return /\["class", "home", "check"\]\.includes\(slot\)/.test(r) && /slot === "check"\n?\s*\? \{ sheet_id: sheetId, slot, item_id: l\.item_id, unit_id: u, range_note: range \|\| null, sort: \+\+sort \}/.test(r) && /check: home/.test(r); })(),
  "give-here/세그/제목/lib");
ok("(어59) 배정 모달의 교재 목록은 **진행중이 먼저**(보류 교재에 배정하면 (어57) 대로 카드에서 접혀 안 보인다) · 보류면 이름 옆에 무엇으로 보류인지 적는다",
  (() => { const r = strip(readFileSync("lib/routine.js", "utf8")); return /const st = stopOn\(b, sheet\.date\)/.test(r) && /\.sort\(\(a, b\) => Number\(a\.stop !== "running"\) - Number\(b\.stop !== "running"\)\)/.test(r); })()
  && /b\.stopName \? ` · \$\{b\.stopName\}` : ""/.test(row), "givePool 차례 · 이름 꼬리");
ok("(어59) 모달에서 **단원과 활동이 갈린다**(원장님 「학습항목과 단원이 구별이 안되는점」) · 머리 둘(📕 단원 · ✓ 활동) · 활동은 들여쓴다 · **이미 끝낸 단원**은 「다 함」으로 흐리고 안 한 단원이 먼저(「이미 완료된 부분이 표시안되는점」)",
  /data-g="give-units-h">📕 단원/.test(row) && /data-g="give-items-h">✓ 활동/.test(row) && /data-g="give-items" style=\{\{ marginLeft: 14 \}\}/.test(row)
  && /data-done=\{u\.left \? "0" : "1"\}/.test(row) && /data-g="unit-done">다 함/.test(row) && /const ordUnits = \[\.\.\.here\]\.sort\(/.test(row));
ok("(어60) 검사 카드는 **검사에서 뒤늦게 적은 줄**이 있으면 보류 교재라도 안 접는다(원장님 2026-09-16 「숙제검사에서 배정한 지난시간 숙제가 검사할 것으로 떠야하는데 안뜸」) · 볼 것이 없을 때만 접는다((어57))",
  /const own = \(bid\) => sheet\.check\.some\(\(r\) => r\.units\?\.book_id === bid && !r\.carry_of\)/.test(row) && /stopOn\(b, date\) !== "running" && !own\(b\.book_id\)/.test(row));
ok("(어61) 배정 모달의 대단원 고르개는 **늘 보이고** 맨 위가 「전체 단원 K개」(원장님 2026-09-16 「숙제검사에서 숙제를 배정할때 교재단원이 극히 일부만 나오는데 이유가뭐지」 — 대단원 하나로 걸러 놓고 고르개는 둘 이상일 때만 나와 걸러진 줄이 안 보였다) · 걸렀으면 「교재 전체 K」 를 셈에 적는다 · 손(givePool)은 그 교재의 active 단원을 **전부** 준다",
  /\{chapters\.length > 0 && <select[\s\S]{0,240}data-g="give-chapter"[\s\S]{0,200}<option value="">전체 단원 \{allUnits\.length\}개<\/option>/.test(row)
  && /\{units\.length\}\/\{here\.length\}\{chapter \? ` · 교재 전체 \$\{allUnits\.length\}` : ""\}/.test(row)
  && !/chapters\.length > 1/.test(row)
  && (() => { const r = readFileSync("lib/routine.js", "utf8"); const i = r.indexOf("export async function givePool"); const body = r.slice(i, r.indexOf("export async function applyGive", i));
      return /from\("units"\)[\s\S]{0,200}\.eq\("book_id", bookId\)\.eq\("state", "active"\)\.order\("sort"\)/.test(body) && !/\.limit\(/.test(body); })());
ok("(어55) 세그는 **칸 안에 갇혀** 좁아지면 접어 내린다(max-width) · 안 가두면 칸 밖으로 249px 로 서서 옆 칸을 덮어 「하나 더」를 눌러도 이웃의 「✕ 받은 단원 다시」가 눌렸다(1열을 넓혀 3열 한 쪽이 198px 이 되자 터졌다) · 접힌 줄은 폭을 채우고(flex) 줄 사이는 1px 로 가른다 · 키는 min-height 라 한 줄일 때 모양은 그대로",
  /\.seg\{display:flex;flex-wrap:wrap;/.test(css) && /\.seg\{min-height:var\(--h-md\)[^}]*max-width:100%[^}]*row-gap:1px/.test(css) && /\.seg>button\{[^}]*flex:1 1 auto\}/.test(css) && /\.seg\.sm\{min-height:var\(--h-sm\)\}/.test(css) && !/\.seg\{height:var\(/.test(css));
ok("(어55) 「그 밖에」 줄의 손도 아이콘+툴팁(원장님 2026-09-16 「3열에 오늘학습파트 버튼이 좀 빢빡해질거같은데 이름을 줄여 정 안되면 아이콘+툴팁」) · 좁은 칸에서 ✎ 를 누르려다 옆 단추가 눌리던 것",
  /data-act="item-move" \{\.\.\.icon\(mvName, mvTip\)\}/.test(row) && /data-act="item-next" \{\.\.\.icon\("다음 시간", "다음 시간으로 미루기"\)\}/.test(row)
  && /"🏠", "숙제로", "집에서 할 숙제로"/.test(row) && /"🏫", "학원으로", "학원에서 할 것으로"/.test(row) && !/숙제로 미루기|↩ 학원에서/.test(row));
ok("(어55) 01 3단 폭 · 2열(업무 250)만 그대로 · 1열(학생)과 3열(내용)이 비슷하다(원장님 2026-09-16 「2열만 현재 유지하고 1, 3열은 비슷한 너비로 해도 되는거아냐?」) · 1열 알약은 한 덩어리라 2회독·경고가 붙어도 안 꺾인다",
  /\.split\{[^}]*grid-template-columns:clamp\(300px,calc\(50% - 139px\),560px\)/.test(css) && /\.split \.row>\.panel\{[^}]*grid-template-columns:250px/.test(css)
  && /\.rowtop \.pills\{[^}]*flex-wrap:nowrap[^}]*margin-left:auto/.test(css) && /\.rowtop \.pill\{white-space:nowrap\}/.test(css) && /<span className="pills" data-g="row-pills">/.test(row));
ok("(어55) 하원은 눈에 띄고(pri) **다시 눌러 취소된다**(원장님 2026-09-16 「하원버튼 실수할거같으니 강조해주고, 다시 누르면 취소가능하게」) · 취소는 학원 사람이 찍은 것만(아이 앱이 찍은 것은 1차 기준) · 화면 먼저(속도-3)",
  /className="btn sm pri" data-act="leave-now"/.test(row) && /data-act="leave-undo"/.test(row) && /t\.out\.by === "staff" &&/.test(row) && /setT\(\{ \.\.\.t, out: null \}\)/.test(row)
  && (() => { const a = strip(readFileSync("lib/arrival.js", "utf8")); return /export async function clearStamp\(/.test(a) && /\.eq\("stamped_by", "staff"\)/.test(a); })(), "하원 강조·취소");
ok("(어57) 보류된 교재는 **속을 안 그린다**(원장님 9/16 「숙제검사와 오늘학습에서 보류된 교재는 내용을 볼 필요가 없잖아. 진행중으로 바꾸면 그때 상세내용보이고, 그전에는 목록과 상태버튼만 카드 맨밑에」) · 두 카드가 같은 부품(PausedBooks) · 상태 세그는 한 벌(useStop · 교재 카드와 같은 것) · 오늘 학습은 보류 교재의 블록을 아예 안 세운다",
  /function PausedBooks\(/.test(row) && /function useStop\(/.test(row) && (row.match(/<PausedBooks /g) ?? []).length === 2
  && /const \[stop, stopSeg\] = useStop\(b, sheet, date, closed, fail, start\)/.test(row)
  && /const runBooks = ordered\.filter\(\(b\) => stopOn\(b, date\) !== "book_off"\)/.test(row) && /\{runBooks\.map\(/.test(row) && !/\{ordered\.map\(/.test(row)
  && !/data-act="stopped-open"/.test(row) && (row.match(/data-g="stop"/g) ?? []).length === 1,
  `PausedBooks ${(row.match(/<PausedBooks /g) ?? []).length}곳 · data-g="stop" ${(row.match(/data-g="stop"/g) ?? []).length}벌`);
ok("(어56) 숙제 배정은 글이 아니라 교재 › 단원 × 루틴 활동(원장님 9/16 「숙제주기를 텍스트로 주면 루틴이 안 먹잖아. 밑에 숙제배정과 같은 방식으로 배정하도록 모달을 띄우게해」) · 단추는 숙제가 있어도 보인다(잘못 나간 것을 고치는 자리) · 손은 lib/routine applyGive 하나 · 글 한 줄 길은 남는다(「a인데 필요시 추가도 가능하게」)",
  /data-act="give"/.test(row) && /data-g="give-modal"/.test(row) && !/sheet\.home\.length === 0 &&/.test(row)
  && ["give-book", "give-unit", "give-item", "give-free"].every((g) => new RegExp(`data-g="${g}"`).test(row))
  && /giveApply\(sheet\.id, bookId, slot, \{ unitIds: units, itemIds: items \}\)/.test(row) && /await give\(sheet\.id, slot, text\)/.test(row)
  && /export async function applyGive/.test(strip(readFileSync("lib/routine.js", "utf8"))) && /export async function givePool/.test(strip(readFileSync("lib/routine.js", "utf8"))),
  String((row.match(/data-g="give-[a-z]+"/g) ?? []).join(",")));
ok("(어56) 배정한 줄은 루틴이 깐 줄과 **같은 모양**(item_id · unit_id · sort · required · gate_prev)이라 검사 카드의 교재별 묶기·루틴 차례가 그대로 먹는다(day-plan bookLine) · 안 고른 줄은 지우지 않고 내린다(off · 대전제-6) · 넘어온 줄(carry_of)·글 줄은 안 건드린다",
  (() => { const r = strip(readFileSync("lib/routine.js", "utf8")); const i2 = r.indexOf("export async function applyGive"); const body = r.slice(i2, r.indexOf("/** 조절 적용", i2));
    return /assertOpen\(sb, sheetId\)/.test(body) && /item_id: l\.item_id, unit_id: u/.test(body) && /required: Boolean\(l\.required\), gate_prev: Boolean\(l\.gate_prev\)/.test(body) && /update\(\{ off: true \}/.test(body) && /update\(\{ off: false \}/.test(body) && /filter\(\(r\) => isAuto\(r\)\)/.test(body) && !/\.delete\(/.test(body); })());
ok("(어56) 배정 모달은 그 자리(집·학원)의 루틴 활동을 **전부 체크된 채**로 연다(원장님 답 ⓐ) · 오늘 이미 깔린 줄이 있으면 그것을 그대로 보여 고치게 한다",
  /const seed = \(p, sl\) =>/.test(row) && /mine\.length \? \[\.\.\.new Set\(mine\.map\(\(h\) => h\.item_id\)\)\] : \(p\.lines\?\.\[sl\] \?\? \[\]\)\.map\(\(l\) => l\.item_id\)/.test(row) && /\(p\.have \?\? \[\]\)\.filter\(\(h\) => h\.slot === sl && !h\.off\)/.test(row));{ const routine = readFileSync("lib/routine.js", "utf8"), plan = readFileSync("lib/routine-plan.js", "utf8"), day = readFileSync("lib/day.js", "utf8");   // (어33) 원장님 9/15 「오늘 화면에 회차라는 단어 사용하지마」 · 「네 언어말고, 일반적인 학원선생님이 좀 알아들을 수 있는 말로」
  ok("(어33) 오늘 01 에 「회차」 0(단원 고르기는 「오늘 단원」 · 조절 알약은 「루틴 11 에서 고치기」) · 01 이 부르는 손의 오류 글에도 0(routine pickWave · day examsSoon)", !/회차/.test(row + page + board) && !/회차를 못 바꿈|회차 줄을 못 세움/.test(routine) && !/곧 있는 회차를 못 읽음/.test(day));
  ok("(어33) 조절 02 는 쉬운 말 · 「○○ 에서 아직 안 나간 소단원 N개 · 다음 대단원 ○○ 도 고를 수 있음」 · 「고른 소단원 N개 = 오늘 N문항 · N쪽」(둘 다 0이면 「문항·쪽 수가 교재에 없음」) · 「나가는 차례 · 대단원마다/소단원마다」 · 「1개면 N문항」 알약 0 · 칩 목록에 대단원 머리", /아직 안 나간 소단원/.test(row) && /도 고를 수 있음/.test(row) && /고른 소단원 \{selected\.length\}개 = 오늘/.test(row) && /문항·쪽 수가 교재에 없음/.test(row) && /나가는 차례/.test(row) && !/1개면/.test(row) && /data-g="tune-chapter"/.test(row));
  ok("(어33) 조절 판은 이 대단원 + 다음 대단원(tunePool chapters 둘 · inChapter) · 칩이 곧 고른 것(tuneStep · tuneCount · tuneSorted · 갯수·뺀 것 두 상태 없음 · tuneUnits 0)", /\)\]\.slice\(0, 2\)/.test(routine) && /inChapter:/.test(routine) && /export function tuneStep/.test(plan) && !/tuneUnits/.test(plan + row + routine) && !/excluded/.test(row)); }
{ const dashPlan = strip(readFileSync("lib/dash-plan.js", "utf8")), rb = strip(readFileSync("app/settings/routine/board.js", "utf8")), routine = readFileSync("lib/routine.js", "utf8"), hw = strip(readFileSync("lib/homework.js", "utf8")), day = readFileSync("lib/day.js", "utf8"), dp = readFileSync("lib/day-plan.js", "utf8"), rp = readFileSync("lib/routine-plan.js", "utf8"), act = readFileSync("app/today/actions.js", "utf8");
  ok("(어33b) 01 이 그리는 lib 글에도 「회차」 0 · 「한 번에 나가는 소단원 수」(dash-plan GAP·gapText 글 · 루틴 11 라벨·오류 글 · 원장님 9/15 「회차라는 단어 쓰지말라고 좀」)", !/"[^"]*회차[^"]*"|`[^`]*회차[^`]*`/.test(dashPlan) && !/회차/.test(rb) && !/회차는 1~6/.test(routine) && /한 번에 나가는 소단원 수는 1~6/.test(routine));
  console.log("■ (어37) 오늘 학습 줄마다 · 단원마다 「건너뛰기 · 다음 시간으로 · 숙제로」(원장님 9/15)");
  ok("학습 단원 머리에 셋(unit-skip · unit-next · unit-home) · 활동 줄마다 셋(line-skip · line-next · line-home) · 숙제 줄엔 「학습으로」(line-class) · 그 밖에 줄에도 「다음 시간으로」(item-next) · 줄에 data-id", /data-act="unit-skip"/.test(row) && /data-act="unit-next"/.test(row) && /data-act="unit-home"/.test(row) && /data-act="line-skip"/.test(row) && /data-act="line-next"/.test(row) && /data-act="line-home"/.test(row) && /data-act="line-class"/.test(row) && /data-act="item-next"/.test(row) && /className="li" key=\{it\.id\} data-id=\{it\.id\}/.test(row));
  ok("「다음 시간에 N」 목록 + 되돌리기(next-back · class 로) · 넘어온 줄은 그 단원 밑에 「M/D 에서 넘어옴」(fromLast · lastFrom) · 교재 카드 줄 판단은 lib/day-plan bookLine 한 벌(row 에 !it.carry_of 필터 0)", /data-g="next-lines"/.test(row) && /data-act="next-back"/.test(row) && /lastFrom\(it\)/.test(row) && /bookLine\(it\)/.test(row) && !/it\.item_id && !it\.carry_of/.test(row) && /export const fromLast/.test(dp) && /export const bookLine/.test(dp));
  ok("손은 lib/homework disposeItem 한 벌(skip=off · next=자리 next · home/class=자리 · 같은 줄이 있으면 off 로 내리고 합침 merged) · disposeMany 는 하나씩 차례로 · moveItem 도 그 손으로 · 손 dispose·disposeMany", /export async function disposeItem/.test(hw) && /export async function disposeMany/.test(hw) && /return disposeItem\(sb, itemId, slot\)/.test(hw) && /merged: true/.test(hw) && /export const dispose = /.test(act) && /export const disposeMany = /.test(act));
  ok("판 모양에 next 자리(shape) · 원본 줄의 자리를 읽는다(carry:carry_of(slot,…)) · 다음 판이 설 때 지난 판의 next 줄을 이어 깐다(routine layRoutine · slot next · 60일 · 판단 routine-plan nextCarry 순수 · 같은 활동이 깔리면 carry_of 만)", /next: by\("next"\)/.test(day) && /carry:carry_of\(slot,day_sheet\(date\)\)/.test(day) && /export function nextCarry/.test(rp) && /nextCarry\(/.test(routine) && /\.eq\("slot", "next"\)/.test(routine) && /inRows\.carry_of = l\.id/.test(routine)); }
{ const rp = readFileSync("lib/routine-plan.js", "utf8"), rt = readFileSync("lib/routine.js", "utf8");   // (어38) 원장님 9/15 「이거 버튼 안 먹힘 · s2 s다시 이게 대체 무슨 말이야」
  ok("(어38) 오늘 단원 세그의 말은 뜻으로(waveLabel · 지난 단원 다시 · 이번 단원 · 하나 더 · 이번 단원 복습 · 다음 단원만) · 저장된 옛 이름(부호)은 안 쓴다 · 실패 글이 뜨면 그리로 굴린다(errRef)", /data-g=\{\x60wave-\$\{slot\}\x60\}[\s\S]{0,500}\{waveLabel\(o\)\}/.test(row) && /again: "지난 단원 다시", redo: "✕ 받은 단원 다시", now: "이번 단원", more: "하나 더", review: "이번 단원 복습", next: "다음 단원만"/.test(rp) && /ref=\{errRef\}/.test(row) && /scrollIntoView/.test(row));
  ok("(어38) 오늘 단원 바꾸기의 줄 배치는 wavePlan(순수) 한 벌 · 자리(rows\[k\])로 앉히지 않는다 · 차례(sort)도 판단이 준 대로 넘긴다((어38c))", /export function wavePlan/.test(rp) && /const plan = wavePlan\(rows, ids\)/.test(rt) && !/const r = rows\[k\]/.test(rt) && /unit_id: u\.unit_id, range_note: null, said_done_at: null/.test(rt) && /sort: u\.sort/.test(rt) && /const pool = rows\.map\(\(r\) => r\.sort\)/.test(rp)); }
console.log(`\n■ 오늘 01 말·차례·PC 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
