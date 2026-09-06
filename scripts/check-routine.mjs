/** 루틴 깔기 검사(확정-⑨·⑬·㉒·㊺a · 검사-⑩) — 순수 판단 lib/routine-plan.js 를 본보기로 돌린다. DB 없이 돈다.
 *  「뺄 항목을 얹은 뒤에도 묶음이 안 비나」(검사-⑩) · 덩어리가 대단원을 안 넘나(확정-④) · 멈춤 셋이 맞나(확정-⑬) · 필수만이 필수 줄만 남기나 · 회차 고르기가 다음 것을 내나 */
import { planBook, chunkOf, linesFor, stopOn, waves, offFor, tuneUnits, loadOf, splitPresets, alive, areaStats, studentAreaView, moveSort, previewUnits, projectEnd, parseChecks, AREAS } from "../lib/routine-plan.js";
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
console.log("■ 루틴 화면 11 — 내린 줄은 셈에서 빠진다(확정-㊷) · 영역 머리 알약 · 아이의 한 영역(확정-㉒) · ▲▼ · 예습(확정-57) · 이대로면");
const L = (id, item, place, required, sort, extra = {}) => ({ id, item_id: item, name: item, place, required, sort, state: "active", ...extra });
const areaLines = [L("a1", "구두", "class", true, 1), L("a2", "문장", "both", true, 2), L("a3", "풀기", "class", false, 3, { state: "retired" }), L("a4", "워크북", "home", true, 4), L("a5", "죽은 항목", "home", true, 5, { item_state: "retired" }), L("a6", "교재예습", "next", true, 6)];
ok("살아 있는 줄만 — 내린 줄(retired)·내린 항목은 빠진다", alive(areaLines).map((l) => l.id).join() === "a1,a2,a4,a6");
ok("영역 머리 — 학원 2(구두·문장) · 숙제 2(문장·워크북) · 예습 1(교재예습, place next) · 필수 4", JSON.stringify(areaStats(areaLines)) === JSON.stringify({ class: 2, home: 2, next: 1, required: 4 }));
const v0 = studentAreaView(areaLines, []);
ok("아이 줄이 없으면 「학원 기본 그대로」 — 영역 줄 넷 · 뺀 것 없음", v0.custom === false && v0.lines.map((l) => l.id).join() === "a1,a2,a4,a6" && v0.removed.length === 0);
const v1 = studentAreaView(areaLines, [L("s1", "문장", "home", true, 1), L("s2", "구두", "class", true, 2), L("s3", "워크북", "home", true, 3, { state: "retired" })]);
ok("아이 줄이 있으면 「이 아이만 고침」 — 아이 차례대로(문장·구두) · 뺀 것 = 워크북(내린 아이 줄)·교재예습", v1.custom === true && v1.lines.map((l) => l.name).join() === "문장,구두" && v1.removed.map((l) => l.name).join() === "워크북,교재예습");
ok("▲▼ — 내린 줄은 건너뛰고 이웃과 sort 를 맞바꾼다(a4 ▲ → a2 와) · 맨 위에서 ▲ 는 빈 것", JSON.stringify(moveSort(areaLines, "a4", "up")) === JSON.stringify([{ id: "a4", sort: 2 }, { id: "a2", sort: 4 }]) && moveSort(areaLines, "a1", "up").length === 0);
ok("예습 소단원(확정-57) — 오늘 덩어리 다음 것 · 대단원을 넘어도 다음 것이 다음 것", previewUnits(todo, [todo[0]], 1).map((u) => u.unit_id).join() === "1-5" && previewUnits(todo, [todo[0], todo[1]], 1).map((u) => u.unit_id).join() === "2-1");
const pp = planBook({ lines: [...lines, { item_id: "e", name: "교재예습", place: "next", required: true, sort: 5 }], todo, sb: { stop_mode: "running", per_session: 1 }, date });
ok("계획 — 예습 줄(place next)은 따로 서고 그 소단원은 다음 것(1-4 오늘 · 1-5 예습) · 숙제 자리로 나간다(lib/routine.js) · 숙제멈춤이면 예습도 빠진다", pp.units[0].unit_id === "1-4" && pp.next.map((l) => l.item_id).join() === "e" && pp.home.map((l) => l.item_id).join() === "b,d" && pp.preview.map((u) => u.unit_id).join() === "1-5" && planBook({ lines: [...lines, { item_id: "e", name: "교재예습", place: "next", required: true, sort: 5 }], todo, sb: { stop_mode: "hw_off", per_session: 1 }, date }).next.length === 0);
const days = ["2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14", "2026-09-16"];
ok("이대로면 — 남은 5 ÷ 회차 2 = 수업 3회 → 세 번째 수업일 9/11 · 0.2개월", JSON.stringify(projectEnd({ remaining: 5, perSession: 2, days, from: "2026-09-06" })) === JSON.stringify({ sessions: 3, endDate: "2026-09-11", months: 0.2 }));
ok("남은 것이 없으면 「다 했다」(수업 0회 · 오늘) · 수업일이 모자라면 endDate 없음", projectEnd({ remaining: 0, perSession: 2, days, from: "2026-09-06" }).sessions === 0 && projectEnd({ remaining: 40, perSession: 1, days, from: "2026-09-06" }).endDate === null);
ok("체크리스트 글 — 쉼표·가운뎃점·줄바꿈으로 가른다 · 영역은 일곱(v2.area_name)", parseChecks("입해석, 낭독 · 녹음\n").join("|") === "입해석|낭독|녹음" && AREAS.length === 7);
console.log(`\n■ 루틴 깔기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
