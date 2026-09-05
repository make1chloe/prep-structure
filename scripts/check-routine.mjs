/** 루틴 깔기 검사(확정-⑨·⑬·㉒·㊺a · 검사-⑩) — 순수 판단 lib/routine-plan.js 를 본보기로 돌린다. DB 없이 돈다.
 *  「뺄 항목을 얹은 뒤에도 묶음이 안 비나」(검사-⑩) · 덩어리가 대단원을 안 넘나(확정-④) · 멈춤 셋이 맞나(확정-⑬) · 필수만이 필수 줄만 남기나 · 회차 고르기가 다음 것을 내나 */
import { planBook, chunkOf, linesFor, stopOn, waves, offFor, tuneUnits, loadOf, splitPresets } from "../lib/routine-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const U = (id, chapter, sort) => ({ unit_id: id, chapter, sort, code: id });
const todo = [U("1-4", "CH1", 4), U("1-5", "CH1", 5), U("2-1", "CH2", 6)];
const lines = [
  { item_id: "a", name: "구두테스트", place: "class", required: true, sort: 1 },
  { item_id: "b", name: "문장훈련", place: "both", required: true, sort: 2 },
  { item_id: "c", name: "교재 풀기", place: "class", required: false, sort: 3 },
  { item_id: "d", name: "워크북 복습", place: "home", required: true, sort: 4 },
];
const date = "2026-09-05";
console.log("■ 덩어리 — 안 한 소단원 차례에서, 같은 대단원 안에서만(확정-④)");
ok("한 수업 1덩어리 → 1-4", chunkOf(todo, 1).map((u) => u.unit_id).join() === "1-4");
ok("2덩어리 → 1-4·1-5", chunkOf(todo, 2).map((u) => u.unit_id).join() === "1-4,1-5");
ok("5덩어리여도 대단원을 안 넘는다 → 1-4·1-5", chunkOf(todo, 5).map((u) => u.unit_id).join() === "1-4,1-5");
ok("안 한 소단원이 없으면 빈 것", chunkOf([], 2).length === 0);
console.log("■ 자리마다 줄 — 학원은 class+both, 숙제는 home+both, 차례대로");
ok("학원 줄 셋(구두·문장·풀기)", linesFor(lines, "class").map((l) => l.item_id).join() === "a,b,c");
ok("숙제 줄 둘(문장·워크북)", linesFor(lines, "home").map((l) => l.item_id).join() === "b,d");
console.log("■ 필수만 — 필수 줄만, 그러나 묶음이 통째로 비면 줄이지 않는다(검사-⑩)");
ok("학원 필수만 → 구두·문장", linesFor(lines, "class", "required").map((l) => l.item_id).join() === "a,b");
const noReq = lines.map((l) => ({ ...l, required: false }));
ok("필수 줄이 하나도 없는 묶음은 그대로 셋", linesFor(noReq, "class", "required").length === 3);
console.log("■ 교재 상태 셋(확정-⑬)");
ok("running", stopOn({ stop_mode: "running" }, date) === "running");
ok("hw_off 는 숙제만 뺀다", (() => { const p = planBook({ lines, todo, sb: { stop_mode: "hw_off", per_session: 1 }, date }); return p.class.length === 3 && p.home.length === 0 && p.stop === "hw_off"; })());
ok("book_off 는 다 뺀다 · 까닭이 붙는다", (() => { const p = planBook({ lines, todo, sb: { stop_mode: "book_off", per_session: 1 }, date }); return p.class.length === 0 && p.home.length === 0 && p.why === "교재 멈춤"; })());
ok("stop_until 이 지났으면 진행중", stopOn({ stop_mode: "book_off", stop_until: "2026-09-01" }, date) === "running");
ok("stop_until 이 안 지났으면 그대로 멈춤", stopOn({ stop_mode: "book_off", stop_until: "2026-09-30" }, date) === "book_off");
ok("배정 줄이 없으면 진행중으로 본다", stopOn(null, date) === "running");
console.log("■ 계획 한 벌");
const p = planBook({ lines, todo, sb: { stop_mode: "running", per_session: 1 }, date });
ok("학원 3 · 숙제 2 · 소단원 1-4 · 까닭 없음", p.class.length === 3 && p.home.length === 2 && p.units[0].unit_id === "1-4" && p.why === null);
ok("루틴 줄이 없으면 까닭 「루틴 줄이 없다」", planBook({ lines: [], todo, sb: null, date }).why === "루틴 줄이 없다");
ok("안 한 소단원이 없으면 까닭 「안 한 소단원이 없다」", planBook({ lines, todo: [], sb: null, date }).why === "안 한 소단원이 없다");
console.log("■ 회차 고르기(목업 01) — 학습: 다시·오늘·하나 더 / 숙제: 복습·하나 더·다음만");
const w = waves({ units: [todo[0]], todo, done: U("1-3", "CH1", 3) });
ok("학습 셋: 1-3 다시 · 1-4 · 1-4·1-5", w.class.map((x) => x.key).join() === "again,now,more" && w.class[2].units.map((u) => u.unit_id).join() === "1-4,1-5" && w.class.map((x) => x.name).join(" / ") === "1-3 다시 / 1-4 / 1-4·1-5");
ok("숙제 셋: 1-4 복습 · 1-4·1-5 · 1-5만", w.home.map((x) => x.key).join() === "review,more,next" && w.home[2].units[0].unit_id === "1-5");
ok("마지막 소단원이면 「하나 더」가 없다", waves({ units: [todo[2]], todo: [todo[2]] }).class.length === 1);
console.log("■ 뺀 줄(off) — 지우지 않고 내린다(대전제-6)");
ok("진행중·그대로 → 안 뺀다", offFor({ slot: "home", required: false }, { stop: "running", mode: "all" }) === false);
ok("필수만 → 필수 아닌 줄만 뺀다", offFor({ slot: "class", required: false }, { stop: "running", mode: "required" }) === true && offFor({ slot: "class", required: true }, { stop: "running", mode: "required" }) === false);
ok("숙제멈춤 → 숙제 줄만", offFor({ slot: "home", required: true }, { stop: "hw_off", mode: "all" }) === true && offFor({ slot: "class", required: true }, { stop: "hw_off", mode: "all" }) === false);
ok("교재멈춤 → 다", offFor({ slot: "class", required: true }, { stop: "book_off", mode: "all" }) === true);
console.log("■ 조절(02) — 갯수는 안 한 차례에서, 뺀 칩은 건너뛰고, 대단원을 안 넘는다 · 화면엔 문항·쪽 합계(확정-㉓)");
const big = U("대비", "CH1", 7); big.q_count = 62; big.page_start = 30; big.page_end = 38;
const t2 = [ { ...todo[0], q_count: 15, page_start: 13, page_end: 13 }, { ...todo[1], q_count: 13, page_start: 14, page_end: 14 }, big, todo[2] ];
ok("3개 → 1-4 · 1-5 · 대비 (2-1 은 다음 대단원이라 안 든다)", tuneUnits(t2, 3).map((u) => u.unit_id).join() === "1-4,1-5,대비");
ok("1-5 를 빼면 → 1-4 · 대비", tuneUnits(t2, 2, ["1-5"]).map((u) => u.unit_id).join() === "1-4,대비");
ok("0개면 빈 것", tuneUnits(t2, 0).length === 0);
ok("합계 — 3개면 90문항 · 11쪽", (() => { const l = loadOf(tuneUnits(t2, 3)); return l.questions === 90 && l.pages === 11; })());
ok("62문항 → 이번에 눈금 1-20번 · 1-31번 · 전체(목업 02)", splitPresets(62).map((x) => x.name).join(" · ") === "1-20번 · 1-31번 · 전체");
ok("문항 수가 없으면 눈금이 없다", splitPresets(0).length === 0);
console.log(`\n■ 루틴 깔기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
