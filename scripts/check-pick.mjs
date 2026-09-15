/** 고르기 검사((어28) · 검사-91 · 대전제-20 · 원장님 2026-09-15 「모든 목록은 전체, 일부선택 ->선택후 일괄액션 가능해야함」) · 순수 판단 lib/pick-plan.js 한 벌:
 *  누르면 넣고 다시 누르면 뺀다 · 전체/비우기 · 지금 목록 기준으로 센다(목록에서 사라진 것은 안 센다) · 「고른 N」 글 ·
 *  목록 화면이 한 벌(app/_shell/pick.js)을 쓰나 · 아직 안 붙은 목록 수는 줄기만 한다(늘면 잡는다) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { togglePick, pickAll, pickMany, pickState, pickedText } from "../lib/pick-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
console.log("■ 셈 · 누르면 넣고 다시 누르면 뺀다 · 전체 · 지금 목록 기준");
{ const a = togglePick(new Set(), "x"), b = togglePick(a, "y"), c = togglePick(b, "x");
  ok("누르면 넣고(x → x,y) 다시 누르면 뺀다(x 빠짐) · 원본은 안 건드린다", [...a].join() === "x" && [...b].join() === "x,y" && [...c].join() === "y" && a.size === 1 && b.size === 2);
  ok("전체 → 목록 전부 · 비우기 → 0 · 없는 목록도 안 죽는다", pickAll(["a", "b"]).size === 2 && pickAll(["a", "b"], false).size === 0 && pickAll().size === 0 && togglePick(null, "z").has("z"));
  const st = pickState(new Set(["a", "b", "gone"]), ["a", "b", "c"]);
  ok("지금 목록 기준으로 센다 · 목록에 없는 것(gone)은 안 센다 · 일부(some) · 전부(all)는 목록이 있고 다 골랐을 때만", st.count === 2 && st.ids.join() === "a,b" && st.some && !st.all && pickState(new Set(["a", "b"]), ["a", "b"]).all && !pickState(new Set(), []).all && pickState(null, ["a"]).count === 0);
  ok("「고른 N명」 · 0 이면 빈 글(띠가 안 선다)", pickedText(3, "명") === "고른 3명" && pickedText(1) === "고른 1줄" && pickedText(0, "명") === ""); }
ok("(어31) 한 올린 기록만 넣고 뺀다(pickMany) · 다른 고른 것은 그대로 · 원본은 안 건드린다 · 없는 목록도 안 죽는다", (() => { const s = new Set(["a"]); const t = pickMany(s, ["b", "c"]); const u = pickMany(t, ["a", "b"], false); return [...t].join() === "a,b,c" && [...u].join() === "c" && s.size === 1 && pickMany(null, ["z"]).has("z") && pickMany(new Set(["q"]), null).size === 1; })());
console.log("■ 화면 · 목록마다 한 벌(app/_shell/pick.js) · 아직 안 붙은 목록은 줄기만 한다");
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" ? [] : files(p)) : /\.js$/.test(f) ? [p] : []; });
const src = files("app").map((p) => [p, readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")]);
const pickJs = readFileSync("app/_shell/pick.js", "utf8");
ok("조각 한 벌 · usePick · PickAll · PickBox · PickBar 를 낸다 · 네모는 늘 보인다(「고르기」 켜기 단추 없음 · autoFocus 없음) · 셈은 lib/pick-plan 만", /export function usePick/.test(pickJs) && /export function PickAll/.test(pickJs) && /export function PickBox/.test(pickJs) && /export function PickBar/.test(pickJs) && /from "@\/lib\/pick-plan"/.test(pickJs) && !/autoFocus/.test(pickJs) && !/new Set\(\[\.\.\./.test(pickJs.replace(/only:[^,]*,/, "")));
/** 줄 유형마다(파일:유형) 그 줄 마크업(여는 줄부터 3줄 안)에 PickBox 가 있나 · 같은 이름(student-row)이 다른 화면(04 학생별 표)에도 있어 파일과 같이 센다 */
const pairs = []; for (const [p, s] of src) { const ls = s.split("\n"); ls.forEach((l, i) => { for (const m of l.matchAll(/data-g="([a-z0-9-]+-row)"/g)) { const key = `${p}:${m[1]}`; if (pairs.some((x) => x.key === key)) continue; pairs.push({ key, picked: /<PickBox\b/.test(ls.slice(Math.max(0, i - 2), i + 3).join("\n")) }); } }); }   // 앞 2줄(10 발송의 const ck 처럼 네모를 미리 만든 줄)부터 뒤 3줄 안
const DONE = ["app/ops/students/board.js:student-row", "app/ops/fee.js:fee-row", "app/schedule/exams/board.js:hidden-row", "app/schedule/exams/board.js:nat-row", "app/ops/files/board.js:inbox-row", "app/books/board.js:unit-row", "app/scores/board.js:score-row", "app/_shell/schoolscard.js:school-row", "app/schedule/classes/board.js:class-row"];   // 붙은 목록((어28)-① · ③ · ④) · 10 발송 daily-row 는 띠 없이 부품만이라 아래 따로 본다
for (const key of DONE) { const pr = pairs.find((x) => x.key === key); const file = src.find(([p]) => p === key.split(":")[0])?.[1] ?? ""; ok(`${key} 은 고르기 한 벌을 쓴다(줄에 PickBox · 파일에 PickAll · PickBar · _shell/pick)`, Boolean(pr?.picked) && /<PickAll\b/.test(file) && /<PickBar\b/.test(file) && /(_shell\/|\.\/)pick\.js"/.test(file)); }
{ const row = readFileSync("app/today/row.js", "utf8"), board = readFileSync("app/today/board.js", "utf8");   // (어28)-② 01 학생 줄(.row[data-student] · 유형 수에는 안 든다) · 원장님 「ㅇㅇ넣음」
  ok("01 학생 줄도 고르기 한 벌 · 줄 앞 PickBox(마감된 줄은 disabled) · 판(board.js)에 PickAll · PickBar(출결 다섯 att-picked · 마감 close-picked) · 셈은 usePick", /<PickBox\b[^>]*disabled=\{closed\}/.test(row) && /<PickAll\b/.test(board) && /<PickBar\b/.test(board) && /data-g="att-picked"/.test(board) && /data-act="close-picked"/.test(board) && /usePick\(/.test(board)); }
{ const has = (p, re) => re.test(readFileSync(p, "utf8"));   // (어28)-③ 줄 유형(-row)가 아닌 목록 넷 · 시험 카드 · 업무 카드 · 올린 기록 안 파일 · 영상 카드
  ok("06b 시험 카드 · 05 업무 카드 · 20 올린 기록 안 파일 · 19 영상 카드도 고르기 한 벌(PickBox 가 그 마크업에 · PickAll · PickBar)", has("app/schedule/exams/board.js", /data-g="exam-card"[\s\S]{0,400}<PickBox\b/) && has("app/schedule/todo/board.js", /className=\{"nb-card"[\s\S]{0,600}<PickBox\b/) && has("app/ops/files/board.js", /data-g="bin-file" data-file=\{f\.id\}><PickBox\b/) && has("app/books/videos/board.js", /data-g="video"[\s\S]{0,300}<PickBox\b/) && ["app/schedule/exams/board.js", "app/schedule/todo/board.js", "app/ops/files/board.js", "app/books/videos/board.js"].every((p) => has(p, /<PickAll\b/) && has(p, /<PickBar\b/))); }
{ const has = (p, re) => re.test(readFileSync(p, "utf8")); const send = readFileSync("app/send/board.js", "utf8");   // (어28)-④ 줄 유형(-row)가 아닌 목록 셋 · 루틴 줄 · 상담 카드 · 공지 카드 · ⑤ 10 발송은 부품만(띠 대신 늘 있는 sendbar · 처음 고른 채)
  ok("11 루틴 줄 · 18 상담 카드 · 공지 카드도 고르기 한 벌(PickBox 가 그 마크업에 · PickAll · PickBar) · 10 발송은 usePick(처음 고른 채) · PickAll 둘 · 제 네모 없음", has("app/settings/routine/board.js", /data-g="line"[\s\S]{0,200}<PickBox\b/) && has("app/settings/routine/board.js", /<PickBar\b/) && has("app/ops/inquiry/board.js", /data-g="card"[\s\S]{0,200}<PickBox\b/) && has("app/ops/inquiry/board.js", /<PickBar\b/) && has("app/send/notice/board.js", /data-g="notice"[\s\S]{0,400}<PickBox\b/) && has("app/send/notice/board.js", /<PickBar\b/) && /usePick\(selectable, /.test(send) && (send.match(/<PickAll\b/g) ?? []).length === 2 && /<PickBox\b/.test(send) && !/type="checkbox"/.test(send)); }
{ const has = (p, re) => re.test(readFileSync(p, "utf8"));   // (어31) 01 반 머리 · 「반 전체」 네모는 그 반의 줄만(PickGroup · usePick setMany · pickMany 한 벌)
  ok("(어31) 부품에 PickGroup(pick-group · setMany) · 01 판에 ClassHead(반 이름 크게 · data-g=class-head · 그 안에 PickGroup) · 페이지가 반마다 ClassHead(작은 hh 줄은 없앰)", /export function PickGroup/.test(pickJs) && /data-g="pick-group"/.test(pickJs) && /setMany: \(list, on\) => setSel\(\(s\) => pickMany\(s, list, on\)\)/.test(pickJs) && has("app/today/board.js", /export function ClassHead[\s\S]*data-g="class-head"[\s\S]*<PickGroup\b/) && has("app/today/page.js", /<ClassHead\b/) && !has("app/today/page.js", /className="hh"/)); }
const noPick = pairs.filter((x) => !x.picked).map((x) => x.key);
ok(`아직 고르기 없는 목록(파일:유형) ≤ 36(지금 ${noPick.length} · 새 목록을 고르기 없이 더하면 여기서 잡힌다) · 붙은 목록 ${pairs.length - noPick.length}`, noPick.length <= 36 && pairs.length - noPick.length >= DONE.length, noPick.map((k) => k.replace(/^app\//, "")).join(" · "));
ok("고르기 띠는 savebar pickbar 한 벌 · 「고른 N」이 앞 · 비우기(data-act=pick-clear)가 끝 · 고른 것이 없으면 안 그린다", /className="savebar pickbar"/.test(pickJs) && /data-g="picked"/.test(pickJs) && /data-act="pick-clear"/.test(pickJs) && /if \(!pick\.count\) return null/.test(pickJs));
console.log(`\n■ 고르기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
