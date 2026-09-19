/** 진도 부호·말 한 곳 검사((어43) · 검사-58 지킴 · 원장님 9/15 「이걸 초5가 알아보겠냐? 직관적의 뜻 몰라?」 · 「10번 학생어플이야」) · lib/mark.js 순수 ·
 *  부호 ◐ 를 제 손으로 적는 화면 0(01 · 02b · 07 · 08 · 14 · 설정 진도 체크가 한 곳을 쓴다) · 08 은 칸반이 아니라 책 차례 한 줄 · 상태 말 · 막대 · 큰 네모 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MARK, markCh, markText, TRI, CHECK_DOT } from "../lib/mark.js";
import { TRI as T2 } from "../lib/progress-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
console.log("■ 부호·말 한 곳");
ok("부호 넷(○ ◐ · ⏭) · 원장 말(완료 · 하는 중 · 아직 · 건너뜀) · 아이 말(다 했어요 · 하고 있어요 · 아직 · 건너뛰었어요) · 모르는 값은 아직", markCh("done") === "○" && markCh("doing") === "◐" && markCh("none") === "·" && markCh("skip") === "⏭" && markText("done") === "완료" && markText("done", "kid") === "다 했어요" && markText("doing", "kid") === "하고 있어요" && markText("skip", "kid") === "건너뛰었어요" && markText("zzz") === "아직" && markCh(undefined) === "·" && Object.keys(MARK).join() === "done,doing,none,skip");
ok("TRI(○ ◐ ·)는 mark 한 곳 · progress-plan 이 같은 것을 내보낸다 · 01 진도 점(○ ◐ ✕)도 여기", TRI === T2 && TRI.map(([k, c]) => `${k}${c}`).join() === "done○,doing◐,none·" && CHECK_DOT.done === "○" && CHECK_DOT.weak === "◐" && CHECK_DOT.missing === "✕");
console.log("■ 화면 · 부호를 제 손으로 적는 자리 0 · 08 은 한 줄 목록");
const strip = (z) => z.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 폰-5 주석은 먼저 지운다
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : files(p)) : /\.js$/.test(f) ? [p] : []; });
const src = [...files("app"), ...files("lib")].filter((p) => p !== "lib/mark.js").map((p) => [p, strip(readFileSync(p, "utf8"))]);
const hand = src.filter(([, s]) => /◐/.test(s)).map(([p]) => p);
ok("◐ 를 제 손으로 적은 파일 0(app · lib · lib/mark.js 만) · 14 · 설정 진도 체크 · 교재 배정 · 02b 띠가 markCh · markText · TRI 를 쓴다", hand.length === 0 && /markCh\(p\.status\)/.test(src.find(([p]) => p === "app/ops/students/board.js")[1]) && /markCh\(p\.status\)/.test(src.find(([p]) => p === "app/settings/progress/board.js")[1]) && /markCh\("doing"\)/.test(src.find(([p]) => p === "app/_shell/assignmodal.js")[1]) && /markText\(k\)/.test(src.find(([p]) => p === "app/_shell/progressmodal.js")[1]) && /CHECK_DOT as UNIT_MARK/.test(src.find(([p]) => p === "lib/roster-plan.js")[1]) && /import \{ TRI \} from "\.\/mark\.js"/.test(src.find(([p]) => p === "lib/progress-plan.js")[1]) && !/STATUS_TEXT/.test(src.find(([p]) => p === "lib/road-plan.js")[1]), hand.join(" · "));
const me = src.find(([p]) => p === "app/me/book/board.js")[1];
ok("08 은 책 차례 한 줄 목록(칸반 col-* · ○◐· 세그 0) · 대단원 줄마다 상태 말(word) · 막대(bar) · n / N · 펼치기(toggle-chapter) · 소단원 줄 큰 네모(big-ck) · 「이 단원 다 했어요」 네모(chapter-ck) · 말은 lib/mark kid", !/col-doing|col-done|col-todo|data-g="tri"|chapter-tri/.test(me) && /data-g="word"/.test(me) && /className="bar"/.test(me) && /data-g="chapter-n"/.test(me) && /data-act="toggle-chapter"/.test(me) && /data-g="big-ck"/.test(me) && /data-g="chapter-ck"/.test(me) && /from "@\/lib\/mark"/.test(me) && /markText\(s, "kid"\)/.test(me) && !/다 했어요|하고 있어요/.test(me.replace(/이 단원 \{MARK\.done\.kid\}/g, "")));
const css = readFileSync("app/globals.css", "utf8");
ok("08 CSS 는 목업 → globals(.rlist · .rd · .rst.done/.doing · .bigck 28px)", /\.rlist\{/.test(css) && /\.rd\{/.test(css) && /\.rst\.done\{/.test(css) && /\.rst\.doing\{/.test(css) && /\.bigck\{width:28px;height:28px/.test(css));
{ const row = src.find(([p]) => p === "app/today/row.js")[1], pm = src.find(([p]) => p === "app/_shell/progressmodal.js")[1];   // (어63) 원장님 2026-09-16 「현재진도를 파악하고 수정하기에 쉬운 구조로」
  ok("(어63) **눌린 색을 고르는 CSS 열쇠도 lib/mark.js TRI 한 곳에서** 나온다 · 화면이 손으로 적으면 어긋나 눌림이 안 보인다((어23) 과 같은 종류 · 2026-09-16 실제로 02b 진도 체크가 done·doing·none 을 적어 색이 안 났다)",
    TRI.every(([, , css]) => css && new RegExp(`\\.tri button\\[aria-pressed="true"\\]\\[data-p="${css}"\\]`).test(readFileSync("app/globals.css", "utf8")))
    && [pm, row].every((f) => !/data-p=\{k\}/.test(f) && /data-p=\{css\}/.test(f))
    && (() => { const w = readFileSync("scripts/e2e/today.mjs", "utf8");   // 걷기도 열쇠를 손으로 적으면 어긋나 「눌러도 안 먹힌다」가 된다(2026-09-16 실제로 깨졌다)
        return /import \{ TRI \} from "\.\.\/\.\.\/lib\/mark\.js"/.test(w) && !/data-p=(done|doing|none)[\]"' ]/.test(w) && !/"data-p"\)\) === "(done|doing|none)"/.test(w); })(), TRI.map(([k, , c]) => `${k}=${c}`).join(" · "));
  ok("(어63) 배정 창의 단원마다 진도 세그(○◐·)가 서고 **그 자리에서 고친다** · 손은 lib/progress setUnit 하나(02b 진도 체크와 같은 것) · 화면 먼저 · 실패하면 되돌린다(속도-3)",
    /data-g="unit-prog"/.test(row) && /data-st=\{stOf\(u\)\}/.test(row) && /progressSet\(sheet\.id, u\.id, k\)/.test(row) && /setSeen\(\(o\) => \(\{ \.\.\.o, \[u\.id\]: prev \}\)\)/.test(row)); }
console.log(`\n■ 진도 부호·말 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
