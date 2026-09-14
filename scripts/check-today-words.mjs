/** 오늘 01 은 설명하지 않는다 — 검사-87((어12) · 원장님 2026-09-13 「쓸데없는 설명을 빼고 직관적으로 기능을 파악하고 생각의 흐름에 따라 페이지를 따라가게 해야해」).
 *  2026-09-13 실측: 01 에 설명 55곳 1,786자 · 단추 이름 평균 21.1자 · 카드 차례가 아이마다 달랐다(🔤 가 앞뒤로 튐) · PC 도 960 한 줄. 다시 흩어지면 여기서 잡는다 — 글자 검사는 주석을 먼저 지운다(폰-5) */
import { readFileSync } from "node:fs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const row = strip(readFileSync("app/today/row.js", "utf8")), page = strip(readFileSync("app/today/page.js", "utf8")), board = strip(readFileSync("app/today/board.js", "utf8"));
const css = readFileSync("app/globals.css", "utf8");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const 한글 = (t) => t.replace(/[^가-힣]/g, "").length;
console.log("■ 01 은 설명하지 않는다 — 이름이 말한다(대전제-15)");
ok("ⓘ Tip 0 — 접힌 설명도 설명이다", !/<Tip\b/.test(row));
const titles = [...row.matchAll(/<[a-z][^>]*\stitle=/g)].length;
ok("마우스 대면 뜨는 title= 0(html 요소) — 폰엔 마우스가 없다", titles === 0, String(titles));
// 설명 문장 — note·small·placeholder 안에서 「~합니다」로 끝나는 글. 상태 글(「메모 없음」「3/5 남음」「예: 워크북 p.10」)은 안 걸린다
const texts = [...row.matchAll(/(?:className="note[^"]*"[^>]*>|<small[^>]*>|placeholder="?)([^<{"]*)/g)].map((m) => m[1].trim()).filter(Boolean);
const explain = texts.filter((t) => /(합니다|됩니다|십시오|세요|입니다)[.)]?$/.test(t) || /(합니다|됩니다) —/.test(t));
ok(`note·small·placeholder 안의 「~합니다」 설명 문장 ≤ 4(지금 ${explain.length} · 2026-09-13 엔 이런 조각이 55곳 1,786자)`, explain.length <= 4, explain.map((t) => t.slice(0, 40)).join(" | "));
// 단추 글 — onClick={() => …} 안의 「>」에 속지 않게 중괄호 깊이를 세며 여는 태그 끝을 찾는다(9/13 의 첫 셈 「평균 21.1자」는 이걸 안 해서 틀린 수였다 — 여기서 바로 잰다)
const noExpr = (t) => { let o = "", d = 0; for (const ch of t) { if (ch === "{") d++; else if (ch === "}") { if (d > 0) d--; } else if (d === 0) o += ch; } return o; };   // {식} 은 겹쳐도 통째로 뺀다 — 글자로 적힌 이름만 센다
function labels(src) { const out = []; let i = 0; while ((i = src.indexOf("<button", i)) !== -1) { let j = i + 7, d = 0; for (; j < src.length; j++) { const ch = src[j]; if (ch === "{") d++; else if (ch === "}") d--; else if (ch === ">" && d === 0) break; } const end = src.indexOf("</button>", j); if (end === -1) break; out.push(noExpr(src.slice(j + 1, end)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()); i = end + 9; } return out; }
const btns = labels(row).filter((t) => 한글(t) >= 1);
const avg = btns.reduce((a, b) => a + b.length, 0) / btns.length, long = btns.filter((t) => t.length > 14);
ok(`단추 이름은 이름이다 — 글자로 적힌 ${btns.length}개 평균 ≤ 9자(지금 ${avg.toFixed(1)}) · 14자 넘는 것 0(${long.length})`, avg <= 9 && long.length === 0, long.join(" | "));
console.log("■ 차례는 고정 — 생각의 흐름(① 숙제 봤나 → ② 오늘 뭐 하나 → ③ 다음 숙제 → ④ 끝)");
const order = ["<CheckCard", "<WorkCard", "<AreaMemoCard", "<LateCard", "<CommentCard"].map((k) => row.indexOf(k));
ok("판 안 카드 차례 check → work → areamemo → late → comment · 아이마다 다른 자리 없음(quizEnd 0 · data-pos 0 · quiz_pos 0)", order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && !/quizEnd|data-pos|quizPos|quiz_pos/.test(row), order.join(","));
const check = row.slice(row.indexOf("function CheckCard("), row.indexOf("function CheckItem("));
ok("🔤 는 숙제 검사 카드 안 **맨 끝**(원장님 9/13 「차라리 무조건 단어를 숙제검사 마지막에 넣어」) · 📝 단원평가 · 🃏 클래스카드도 그 안(🃏 → 📝 → 🔤) · 제목 줄이 있는 것만 말한다", /<CcPart/.test(check) && /<UnitTestPart/.test(check) && /<QuizPart/.test(check) && check.lastIndexOf("<QuizPart") > check.lastIndexOf("<UnitTestPart") && check.lastIndexOf("<UnitTestPart") > check.lastIndexOf("<CcPart") && /has\.join/.test(check));
ok("루틴 11 에 🔤 자리 세그 0(설정이 아니라 기본값 — 대전제-14 · quiz_pos 를 읽는 여섯 파일은 check-quiz 가 본다)", !/quiz-pos/.test(strip(readFileSync("app/settings/routine/board.js", "utf8"))));
console.log("■ PC 부터 — 두 열(원장님 9/13 「pc부터 고쳐야되고」)");
ok("01 은 960 한 줄이 아니다 — page.js 에 maxWidth: 960 없음 · Board(.split)가 반들을 감싼다", !/maxWidth: 960/.test(page) && /<Board initial=/.test(page) && /className="split"/.test(board));
ok("한 번에 한 아이 — 열림은 board.js 한 곳(useOpen) · row.js 에 defaultOpen 없음 · 브라우저 저장 0(폰-7)", /useOpen\(student\.id\)/.test(row) && !/defaultOpen/.test(row) && !/sessionStorage|localStorage/.test(row + board));
ok("목업에서 갈라낸 .split 규칙 — ≥1100px 두 열 · 판은 오른쪽 열(absolute) · 폰은 그대로(디자인-3)", /@media\s*\(min-width:\s*1100px\)\s*\{\s*\.split\{display:grid/.test(css) && /\.split \.row>\.panel\{[^}]*position:absolute/.test(css));
ok("저장줄은 판 안(rowbar 가 .panel 의 직접 자식 — PC 는 오른쪽 열 안에서 sticky)", /<div className="savebar rowbar" ref=\{setBarHost\} \/>\}\n\s*<\/div>\n\s*\)\}/.test(row));
ok("(어13) 숙제 0 이면 「+ 숙제 주기」 단추 하나 → 모달(give-modal · lib/homework addItems 여러 줄) — 페이지에 늘 보이는 양식은 안 늘었다(항목 더하기 단추 2개 그대로 · 원장님 9/14 「기존 페이지에서 더 늘어나지않게」)", /data-act="give"/.test(row) && /data-g="give-modal"/.test(row) && /sheet\.home\.length === 0 &&/.test(row) && (row.match(/>항목 더하기<\/button>/g) ?? []).length === 2 && /export async function addItems/.test(strip(readFileSync("lib/homework.js", "utf8"))));
console.log(`\n■ 오늘 01 말·차례·PC 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
