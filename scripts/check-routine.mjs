/** 루틴 깔기 검사(확정-⑨·⑬·㉒·㊺a · 검사-⑩) — 순수 판단 lib/routine-plan.js 를 본보기로 돌린다. DB 없이 돈다.
 *  「뺄 항목을 얹은 뒤에도 올린 기록이 안 비나」(검사-⑩) · 덩어리가 대단원을 안 넘나(확정-④) · 보류 셋이 맞나(확정-⑬) · 필수만이 필수 줄만 남기나 · 회차 고르기가 다음 것을 내나 */
import { planBook, chunkOf, linesFor, stopOn, waves, wavePlan, waveLabel, choiceOrder, offFor, tuneStep, tuneCount, tuneSorted, nextCarry, loadOf, splitPresets, alive, areaStats, studentAreaView, resolveLines, bookView, moveSort, previewUnits, projectEnd, parseChecks, AREAS, trimCounts, heavyBand, redoUnits, readyBooks, bookRank, orderToday, bookOrder } from "../lib/routine-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const U = (id, chapter, sort) => ({ unit_id: id, chapter, sort, code: id });
const todo = [U("1-4", "CH1", 4), U("1-5", "CH1", 5), U("2-1", "CH2", 6)];
const lines = [
  { item_id: "a", name: "구두테스트", place: "class", required: true, sort: 1 },
  { item_id: "b", name: "문장훈련", place: "both", required: true, sort: 2 },
  { item_id: "c", name: "교재 풀기", place: "class", required: false, sort: 3 },
  { item_id: "d", name: "워크북 복습", place: "home", required: true, sort: 4 },
];
const date = "2026-09-05";
console.log("■ 덩어리 · 안 한 소단원 차례에서, 같은 대단원 안에서만(확정-④)");
ok("한 수업 1덩어리 → 1-4", chunkOf(todo, 1).map((u) => u.unit_id).join() === "1-4");
ok("2덩어리 → 1-4·1-5", chunkOf(todo, 2).map((u) => u.unit_id).join() === "1-4,1-5");
ok("5덩어리여도 대단원을 안 넘는다 → 1-4·1-5", chunkOf(todo, 5).map((u) => u.unit_id).join() === "1-4,1-5");
ok("안 한 소단원이 없으면 빈 것", chunkOf([], 2).length === 0);
console.log("■ 자리마다 줄 · 학원은 class+both, 숙제는 home+both, 차례대로");
ok("학원 줄 셋(구두·문장·풀기)", linesFor(lines, "class").map((l) => l.item_id).join() === "a,b,c");
ok("숙제 줄 둘(문장·워크북)", linesFor(lines, "home").map((l) => l.item_id).join() === "b,d");
console.log("■ 필수만 · 필수 줄만, 그러나 올린 기록이 통째로 비면 줄이지 않는다(검사-⑩)");
ok("학원 필수만 → 구두·문장", linesFor(lines, "class", "required").map((l) => l.item_id).join() === "a,b");
const noReq = lines.map((l) => ({ ...l, required: false }));
ok("필수 줄이 하나도 없는 올린 기록은 그대로 셋", linesFor(noReq, "class", "required").length === 3);
console.log("■ 교재 상태 셋(확정-⑬)");
ok("running", stopOn({ stop_mode: "running" }, date) === "running");
ok("hw_off 는 숙제만 뺀다", (() => { const p = planBook({ lines, todo, sb: { stop_mode: "hw_off", per_session: 1 }, date }); return p.class.length === 3 && p.home.length === 0 && p.stop === "hw_off"; })());
ok("book_off 는 다 뺀다 · 까닭이 붙는다", (() => { const p = planBook({ lines, todo, sb: { stop_mode: "book_off", per_session: 1 }, date }); return p.class.length === 0 && p.home.length === 0 && p.why === "교재 보류"; })());
ok("stop_until 이 지났으면 진행중", stopOn({ stop_mode: "book_off", stop_until: "2026-09-01" }, date) === "running");
ok("stop_until 이 안 지났으면 그대로 보류", stopOn({ stop_mode: "book_off", stop_until: "2026-09-30" }, date) === "book_off");
ok("배정 줄이 없으면 진행중으로 본다", stopOn(null, date) === "running");
console.log("■ 계획 한 벌");
const p = planBook({ lines, todo, sb: { stop_mode: "running", per_session: 1 }, date });
ok("학원 3 · 숙제 2 · 소단원 1-4 · 까닭 없음", p.class.length === 3 && p.home.length === 2 && p.units[0].unit_id === "1-4" && p.why === null);
ok("루틴 줄이 없으면 까닭 「루틴 줄이 없다」", planBook({ lines: [], todo, sb: null, date }).why === "루틴 줄이 없다");
ok("안 한 소단원이 없으면 까닭 「안 한 소단원이 없다」", planBook({ lines, todo: [], sb: null, date }).why === "안 한 소단원이 없다");
// ── 첫 주 돌려보기(2026-09-11)에서 잡힌 것: 유형마다 꼴이 달라 판이 안 섰다. 깔기(lib/routine.js)가 네 벌을 그냥 훑으므로 **셋 다 같은 키**여야 한다
{ const K = ["stop", "units", "class", "home", "next", "preview", "why"];
  const 꼴 = (p) => K.every((k) => k in p) && ["units", "class", "home", "next", "preview"].every((k) => Array.isArray(p[k]));
  const 유형 = {
    "교재 보류": planBook({ lines, todo, sb: { stop_mode: "book_off", per_session: 1 }, date }),
    "안 한 소단원 없음": planBook({ lines, todo: [], sb: null, date }),
    "그냥 진행": planBook({ lines, todo, sb: { stop_mode: "running", per_session: 1 }, date }),
    "숙제 보류": planBook({ lines, todo, sb: { stop_mode: "hw_off", per_session: 1 }, date }),
  };
  for (const [나, p] of Object.entries(유형)) ok(`계획의 꼴이 유형마다 같다. ${나}(class·home·next·preview 가 늘 배열)`, 꼴(p), `키 ${Object.keys(p).join(",")}`); }

console.log("■ 회차 고르기(목업 01) · 학습: 다시·오늘·하나 더 / 숙제: 복습·하나 더·다음만");
const w = waves({ units: [todo[0]], todo, done: U("1-3", "CH1", 3) });
ok("학습 셋: 지난 단원 다시 · 이번 단원 · 하나 더((어38) 말은 뜻으로 · 부호는 codes 에) · 단원은 1-3 / 1-4 / 1-4·1-5", w.class.map((x) => x.key).join() === "again,now,more" && w.class[2].units.map((u) => u.unit_id).join() === "1-4,1-5" && w.class.map((x) => x.name).join(" / ") === "지난 단원 다시 / 이번 단원 / 하나 더" && w.class.map((x) => x.codes).join(" / ") === "1-3 / 1-4 / 1-4·1-5");
ok("숙제 넷: 1-3 다시 · 1-4 복습 · 1-4·1-5 · 1-5만((머) 숙제에도 「다시」)", w.home.map((x) => x.key).join() === "again,review,more,next" && w.home[3].units[0].unit_id === "1-5");
ok("마지막 소단원이면 「하나 더」가 없다", waves({ units: [todo[2]], todo: [todo[2]] }).class.length === 1);
console.log("■ (머) ✕ 받은 단원은 「그 단원 다시」가 기본 · redoUnits · waves 의 done 은 여럿도 된다");
const checks = [{ status: "missing", unit_id: "1-3", units: { book_id: "B" } }, { status: "done", unit_id: "1-2", units: { book_id: "B" } }, { status: "missing", unit_id: "9-1", units: { book_id: "OTHER" } }, { status: "missing", unit_id: null }, { status: "missing", unit_id: "1-3", units: { book_id: "B" } }];
ok("redoUnits · ✕ 이고 단원이 있고 이 교재인 것만 · 같은 단원은 하나", redoUnits(checks, "B").join() === "1-3");
ok("교재를 안 주면 교재를 안 가린다 · ✕ 가 없으면 빈 것", redoUnits(checks).join() === "1-3,9-1" && redoUnits([{ status: "done", unit_id: "1-3" }], "B").length === 0);
const w2 = waves({ units: [todo[0]], todo, done: [U("1-2", "CH1", 2), U("1-3", "CH1", 3)] });
ok("✕ 둘이면 「다시」가 학습·숙제 둘 다 맨 앞(redo 면 「✕ 받은 단원 다시」 · 아니면 「지난 단원 다시」) · 이번 단원(1-4)은 그대로 · 숙제는 「이번 단원 복습」", w2.class[0].name === "지난 단원 다시" && waves({ units: [todo[0]], todo, done: [U("1-2", "CH1", 2)], redo: true }).class[0].name === "✕ 받은 단원 다시" && w2.class[0].codes === "1-2·1-3" && w2.class[0].units.length === 2 && w2.home[0].key === "again" && w2.home[1].name === "이번 단원 복습" && waveLabel({ key: "now", name: "S2·S2" }) === "이번 단원" && waveLabel({ key: "next" }) === "다음 단원만");
console.log("■ (어38) 오늘 단원 바꾸기의 줄 배치(wavePlan · 원장님 9/15 「이거 버튼 안 먹힘」)");
{ const rows = [{ id: "a", unit_id: "1-4", off: false }, { id: "b", unit_id: "대비", off: false }];
  const t = (r, ids) => { const q = wavePlan(r, ids); return q.ups.map((u) => `${u.id}:${u.unit_id ?? ""}:${u.off}`).join() + " | " + q.ins.map((x) => x.unit_id).join(); };
  ok("[1-4·대비]에서 「하나 더」[1-4·1-5·대비] → 든 줄 둘은 그대로 · 1-5 만 새 줄(대비 줄을 1-5 로 바꾸고 새 줄이 대비를 드는 겹침이 없다)", t(rows, ["1-4", "1-5", "대비"]) === " | 1-5");
  ok("[1-4·대비]에서 「이번 단원」[1-4·1-5] → 대비 줄을 1-5 로 돌려 쓴다 · 새 줄 0", t(rows, ["1-4", "1-5"]) === "b:1-5:false | ");
  ok("[1-5·대비]에서 [1-4·1-5] → 1-5 줄은 그대로 · 대비 줄이 1-4 로 · (자리로 앉히면 첫 줄 1-5→1-4, 둘째 줄 대비→1-5 가 겹치던 것)", t([{ id: "a", unit_id: "1-5", off: false }, { id: "b", unit_id: "대비", off: false }], ["1-4", "1-5"]) === "b:1-4:false | ");
  ok("「지난 단원 다시」[1-3] → 첫 줄을 1-3 으로 · 나머지는 off · off 였던 줄이 목표에 있으면 살린다 · 줄이 없으면 전부 새 줄", t(rows, ["1-3"]) === "a:1-3:false,b::true | " && t([{ id: "a", unit_id: "1-4", off: true }], ["1-4", "1-5"]) === "a::false | 1-5" && t([], ["1-4"]) === " | 1-4"); }
{ const t = (r, ids) => { const q = wavePlan(r, ids); return [...q.ups, ...q.ins].map((u) => `${u.id ?? "+"}:${u.unit_id ?? ""}:${u.sort ?? (u.fresh ? "new" : "")}`).join(); };
  const A = () => [{ id: "a", unit_id: "1-4", off: false, sort: 1 }, { id: "b", unit_id: "대비", off: false, sort: 2 }];
  ok("(어38c) 줄을 돌려 써도 차례는 목표 단원 차례대로 · [1-5(1)·대비(2)]에서 [1-4·1-5] → 대비 줄이 1-4 를 들고 1번 자리 · 1-5 줄은 2번(옛 차례가 남아 대비문제가 1-4 앞에 서고 「+ 시험 더하기」 기본 단원이 대비문제가 되던 것)", t([{ id: "a", unit_id: "1-5", off: false, sort: 1 }, { id: "b", unit_id: "대비", off: false, sort: 2 }], ["1-4", "1-5"]) === "b:1-4:1,a::2");
  ok("차례가 이미 맞으면 안 건드린다 · 남는 줄(off)은 산 줄 뒤 자리로", t(A(), ["1-4", "1-5"]) === "b:1-5:" && t(A(), ["대비"]) === "b::1,a::2");
  ok("쓰던 자리가 모자라면 새 줄·밀린 줄은 fresh(소비처가 맨 뒤 번호를 자리 차례대로) · 가운데 새 줄은 쓰던 자리를 받는다 · sort 없는 줄(옛 판)은 차례를 안 건드린다", t([{ id: "a", unit_id: "1-4", off: false, sort: 1 }], ["1-4", "1-5"]) === "+:1-5:new" && t([{ id: "a", unit_id: "1-4", off: false, sort: 1 }, { id: "c", unit_id: "대비", off: false, sort: 2 }], ["1-4", "1-5", "대비"]) === "c::new,+:1-5:2" && t([{ id: "a", unit_id: "1-4", off: false }], ["1-5"]) === "a:1-5:"); }
ok("✕ 받은 것이 오늘 것과 같으면 「다시」를 따로 안 세운다 · done 이 없으면 숙제는 복습부터", waves({ units: [todo[0]], todo, done: [todo[0]] }).class[0].key === "now" && waves({ units: [todo[0]], todo }).home[0].key === "review");
console.log("■ 뺀 줄(off) · 지우지 않고 내린다(대전제-6)");
ok("진행중·그대로 → 안 뺀다", offFor({ slot: "home", required: false }, { stop: "running", mode: "all" }) === false);
ok("필수만 → 필수 아닌 줄만 뺀다", offFor({ slot: "class", required: false }, { stop: "running", mode: "required" }) === true && offFor({ slot: "class", required: true }, { stop: "running", mode: "required" }) === false);
ok("숙제 보류 → 숙제 줄만", offFor({ slot: "home", required: true }, { stop: "hw_off", mode: "all" }) === true && offFor({ slot: "class", required: true }, { stop: "hw_off", mode: "all" }) === false);
ok("교재 보류 → 다", offFor({ slot: "class", required: true }, { stop: "book_off", mode: "all" }) === true);
console.log("■ 조절(02) · 칩이 곧 고른 것 · + 는 도는 차례의 다음 하나(대단원을 넘어도) · − 는 마지막 것 · 화면엔 문항·쪽 합계(확정-㉓ · (어33))");
const big = U("대비", "CH1", 7); big.q_count = 62; big.page_start = 30; big.page_end = 38;
const t2 = [ { ...todo[0], q_count: 15, page_start: 13, page_end: 13 }, { ...todo[1], q_count: 13, page_start: 14, page_end: 14 }, big, todo[2] ];
ok("(어33) 1-4·1-5 에서 + → 대비 · 또 + → 2-1(다음 대단원도 든다 · 원장님 9/15 「소단원 갯수 조절 안돼」) · 다 골랐으면 그대로", tuneStep(t2, ["1-4", "1-5"], 1).join() === "1-4,1-5,대비" && tuneStep(t2, ["1-4", "1-5", "대비"], 1).join() === "1-4,1-5,대비,2-1" && tuneStep(t2, ["1-4", "1-5", "대비", "2-1"], 1).join() === "1-4,1-5,대비,2-1");
ok("1-5 를 빼고 + → 마지막에 고른 것(대비) 뒤의 2-1 · 뒤가 비었으면 앞쪽 것 · − 는 마지막 것 · 하나는 남긴다 · 고른 것은 늘 도는 차례", tuneStep(t2, ["1-4", "대비"], 1).join() === "1-4,대비,2-1" && tuneStep(t2, ["대비", "2-1"], 1).join() === "1-4,대비,2-1" && tuneStep(t2, ["1-4", "1-5", "대비"], -1).join() === "1-4,1-5" && tuneStep(t2, ["1-4"], -1).join() === "1-4" && tuneSorted(t2, ["대비", "1-4"]).map((u) => u.unit_id).join() === "1-4,대비");
ok("직접 친 갯수 3 → 앞 셋 · 0 이면 빈 것", tuneCount(t2, 3).join() === "1-4,1-5,대비" && tuneCount(t2, 0).length === 0);
ok("합계 · 3개면 90문항 · 11쪽", (() => { const l = loadOf(tuneSorted(t2, tuneCount(t2, 3))); return l.questions === 90 && l.pages === 11; })());
ok("62문항 → 이번에 눈금 1-20번 · 1-31번 · 전체(목업 02)", splitPresets(62).map((x) => x.name).join(" · ") === "1-20번 · 1-31번 · 전체");
ok("문항 수가 없으면 눈금이 없다", splitPresets(0).length === 0);
console.log("■ 루틴 화면 11 · 삭제한 줄은 셈에서 빠진다(확정-㊷) · 영역 머리 알약 · 아이의 한 영역(확정-㉒) · ▲▼ · 예습(확정-57) · 이대로면");
const L = (id, item, place, required, sort, extra = {}) => ({ id, item_id: item, name: item, place, required, sort, state: "active", ...extra });
const areaLines = [L("a1", "구두", "class", true, 1), L("a2", "문장", "both", true, 2), L("a3", "풀기", "class", false, 3, { state: "retired" }), L("a4", "워크북", "home", true, 4), L("a5", "죽은 항목", "home", true, 5, { item_state: "retired" }), L("a6", "교재예습", "next", true, 6)];
ok("살아 있는 줄만 · 삭제한 줄(retired)·내린 항목은 빠진다", alive(areaLines).map((l) => l.id).join() === "a1,a2,a4,a6");
ok("영역 머리 · 학원 2(구두·문장) · 숙제 2(문장·워크북) · 예습 1(교재예습, place next) · 필수 4", JSON.stringify(areaStats(areaLines)) === JSON.stringify({ class: 2, home: 2, next: 1, required: 4 }));
const v0 = studentAreaView(areaLines, []);
ok("아이 줄이 없으면 「학원 기본 그대로」 · 영역 줄 넷 · 뺀 것 없음", v0.custom === false && v0.lines.map((l) => l.id).join() === "a1,a2,a4,a6" && v0.removed.length === 0);
const v1 = studentAreaView(areaLines, [L("s1", "문장", "home", true, 1), L("s2", "구두", "class", true, 2), L("s3", "워크북", "home", true, 3, { state: "retired" })]);
ok("아이 줄이 있으면 「이 아이만 수정」 · 아이 차례대로(문장·구두) · 뺀 것 = 워크북(내린 아이 줄)·교재예습", v1.custom === true && v1.lines.map((l) => l.name).join() === "문장,구두" && v1.removed.map((l) => l.name).join() === "워크북,교재예습");
ok("▲▼ · 삭제한 줄은 건너뛰고 이웃과 sort 를 맞바꾼다(a4 ▲ → a2 와) · 맨 위에서 ▲ 는 빈 것", JSON.stringify(moveSort(areaLines, "a4", "up")) === JSON.stringify([{ id: "a4", sort: 2 }, { id: "a2", sort: 4 }]) && moveSort(areaLines, "a1", "up").length === 0);
ok("예습 소단원(확정-57) · 오늘 덩어리 다음 것 · 대단원을 넘어도 다음 것이 다음 것", previewUnits(todo, [todo[0]], 1).map((u) => u.unit_id).join() === "1-5" && previewUnits(todo, [todo[0], todo[1]], 1).map((u) => u.unit_id).join() === "2-1");
const pp = planBook({ lines: [...lines, { item_id: "e", name: "교재예습", place: "next", required: true, sort: 5 }], todo, sb: { stop_mode: "running", per_session: 1 }, date });
ok("계획 · 예습 줄(place next)은 따로 서고 그 소단원은 다음 것(1-4 오늘 · 1-5 예습) · 숙제 자리로 나간다(lib/routine.js) · 숙제 보류이면 예습도 빠진다", pp.units[0].unit_id === "1-4" && pp.next.map((l) => l.item_id).join() === "e" && pp.home.map((l) => l.item_id).join() === "b,d" && pp.preview.map((u) => u.unit_id).join() === "1-5" && planBook({ lines: [...lines, { item_id: "e", name: "교재예습", place: "next", required: true, sort: 5 }], todo, sb: { stop_mode: "hw_off", per_session: 1 }, date }).next.length === 0);
const days = ["2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14", "2026-09-16"];
ok("이대로면 · 남은 5 ÷ 회차 2 = 수업 3회 → 세 번째 수업일 9/11 · 0.2개월", JSON.stringify(projectEnd({ remaining: 5, perSession: 2, days, from: "2026-09-06" })) === JSON.stringify({ sessions: 3, endDate: "2026-09-11", months: 0.2 }));
ok("남은 것이 없으면 「다 했다」(수업 0회 · 오늘) · 수업일이 모자라면 endDate 없음", projectEnd({ remaining: 0, perSession: 2, days, from: "2026-09-06" }).sessions === 0 && projectEnd({ remaining: 40, perSession: 1, days, from: "2026-09-06" }).endDate === null);
ok("체크리스트 글 · 쉼표·가운뎃점·줄바꿈으로 가른다 · 영역은 일곱(v2.area_name)", parseChecks("입해석, 낭독 · 녹음\n").join("|") === "입해석|낭독|녹음" && AREAS.length === 7);
console.log("■ 줄이기 숫자 「그대로 N · 필수만 M」 · 📣 오늘 좀 많습니다(4단계-1)");
{ const u = (id, book, ps, pe) => ({ id, book_id: book, page_start: ps, page_end: pe, q_count: 10 });
  const it = (id, slot, item, unit, req, off = false, extra = {}) => ({ id, slot, item_id: item, unit_id: unit.id, units: unit, required: req, off, carry_of: null, ...extra });
  const u1 = u("u1", "b1", 10, 12), u2 = u("u2", "b1", 13, 13), u3 = u("u3", "b2", 40, 49);
  const items = [it(1, "class", "i1", u1, true), it(2, "class", "i2", u1, false), it(3, "home", "i1", u2, true), it(4, "home", "i3", u2, false, true), it(5, "class", "i9", u3, false), it(6, "check", "i1", u1, true), it(7, "home", null, u1, false, false, { carry_of: 9 })];
  const sheet = { items, class: items.filter((x) => x.slot === "class" && !x.off), home: items.filter((x) => x.slot === "home" && !x.off) };
  const c = trimCounts(sheet);
  ok("그대로 5(학습·숙제 자동 줄 · 뺀 줄도 센다 · 검사 줄·나머지 줄은 안 센다) · 필수만 3(b1 필수 둘 + b2 는 필수가 없어 다 필수)", c.all === 5 && c.required === 3, JSON.stringify(c));
  ok("빈 판이면 0 · 0", JSON.stringify(trimCounts({ items: [] })) === JSON.stringify({ all: 0, required: 0 }) && trimCounts(null).all === 0);
  const books = [{ book_id: "b1", books: { name: "문법책" } }, { book_id: "b2", books: { name: "독해책" } }];
  const h = heavyBand(sheet, 10, books);
  ok("쪽수 · b1 3+1(같은 소단원은 한 번) · b2 10 = 14쪽 > 10 → 띠 「오늘 좀 많습니다. 합쳐 14쪽」 · 「보통 10쪽쯤입니다 · 독해책가 10쪽」 · top 은 독해책", h && h.total === 14 && h.title === "오늘 좀 많습니다. 합쳐 14쪽" && h.small === "보통 10쪽쯤입니다 · 독해책가 10쪽" && h.top.book_id === "b2", JSON.stringify(h));
  ok("문턱 안이면 없음(14 ≤ 14) · 문턱 0 이면 없음 · 뺀 줄(off)은 안 센다", heavyBand(sheet, 14, books) === null && heavyBand(sheet, 0, books) === null && heavyBand({ class: [], home: [it(4, "home", "i3", u3, false, true)] }, 1, books) === null);
}
console.log("■ 교재 예외(4단계-5) · 교재 줄 › 아이 영역 줄 › 학원 영역 줄 · 살아 있는 줄만 · 뺀 것");
{
  const areaL = [L("a1", "구두", "class", true, 1), L("a2", "문장", "both", true, 2), L("a4", "워크북", "home", true, 4)];
  const mineL = [L("s1", "문장", "home", true, 1), L("s2", "구두", "class", true, 2)];
  const bookL = [L("k1", "워크북", "home", true, 1, { gate_prev: true }), L("k2", "문장", "both", true, 2), L("k3", "구두", "class", true, 3, { state: "retired" })];
  const r0 = resolveLines(areaL, [], []), r1 = resolveLines(areaL, mineL, []), r2 = resolveLines(areaL, mineL, bookL), r3 = resolveLines(areaL, mineL, [bookL[2]]);
  ok("아이 줄도 교재 줄도 없으면 학원 영역 줄(source area) · 아이 줄이 있으면 그것(student) · 교재 줄이 살아 있으면 그것만(book · 내린 교재 줄 k3 은 빠진다) · 교재 줄이 전부 내려졌으면 아이 줄로 돌아간다", r0.source === "area" && r0.lines.map((l) => l.id).join() === "a1,a2,a4" && r1.source === "student" && r1.lines.map((l) => l.id).join() === "s1,s2" && r2.source === "book" && r2.lines.map((l) => l.id).join() === "k1,k2" && r2.lines[0].gate_prev === true && r3.source === "student", JSON.stringify([r0.source, r1.source, r2.source, r3.source]));
  const b0 = bookView(areaL, mineL, []), b1 = bookView(areaL, mineL, bookL), b2 = bookView(areaL, [], bookL);
  ok("11 교재 칸 · 교재 줄이 없으면 바탕(아이 영역 줄) 그대로 · 있으면 「이 교재만 고침」 + 뺀 것 = 바탕 중 교재 줄에 없는 항목(바탕이 아이 줄이면 없음 · 학원 줄이면 없음 · 워크북·문장·구두가 다 있다)", b0.custom === false && b0.lines.map((l) => l.id).join() === "s1,s2" && b1.custom === true && b1.lines.map((l) => l.id).join() === "k1,k2" && b1.removed.map((l) => l.name).join() === "구두" && b2.custom === true && b2.removed.map((l) => l.name).join() === "구두", JSON.stringify([b0.lines.map((l) => l.id), b1.removed.map((l) => l.name), b2.removed.map((l) => l.name)]));
}
console.log("■ (어37) 지난 판의 「다음 시간으로」 줄 이어 깔기(nextCarry · 원장님 9/15)");
{ const nl = [{ id: "n2", item_id: "i1", unit_id: "u2", date: "2026-09-14", sort: 1 }, { id: "n1", item_id: "i1", unit_id: "u1", date: "2026-09-12", sort: 3 }, { id: "n3", item_id: null, unit_id: null, range_note: "워크북 p.10", date: "2026-09-14", sort: 2 }, { id: "n4", item_id: "i2", unit_id: "u1", date: "2026-09-13", sort: 1, off: true }, { id: "n5", item_id: "i3", unit_id: "u1", date: "2026-09-13", sort: 2 }];
  const r = nextCarry(nl, new Set(["n5"]), [{ slot: "class", item_id: "i1", unit_id: "u2" }, { slot: "home", item_id: "i1", unit_id: "u1" }]);
  ok("오래된 것부터 · 이미 넘어간 것(n5)·뺀 것(n4)은 안 넘김 · 오늘 학습에 같은 활동(i1·u2)이 있으면 dup(새 줄 없이 그 줄이 그것) · 숙제에만 있는 것은 새 줄 · 손으로 적은 줄은 늘 새 줄", r.map((x) => `${x.id}:${x.dup ? "dup" : "new"}`).join() === "n1:new,n2:dup,n3:new");
  ok("같은 활동을 두 판이 미뤘으면 하나만 새 줄(둘째는 dup) · 비면 빈 것", (() => { const q = nextCarry([{ id: "a", item_id: "i9", unit_id: "u9", date: "2026-09-10" }, { id: "b", item_id: "i9", unit_id: "u9", date: "2026-09-11" }], new Set(), []); return q.map((x) => x.dup).join() === "false,true" && nextCarry([], new Set(), []).length === 0; })()); }
console.log("■ (어41) 「교재 배정」 목록 차례(choiceOrder · 원장님 9/15 「배정이 없으면 걍 진도체크된거부터 뜨게하든가」)");
{ const books = [{ id: "b1", name: "문법책", area: "문법" }, { id: "b2", name: "독해책", area: "독해" }, { id: "b3", name: "단어책", area: "단어" }, { id: "b4", name: "영작책", area: "영작" }];
  const r = choiceOrder(books, ["b1"], [{ book_id: "b3", status: "done" }, { book_id: "b3", status: "doing" }, { book_id: "b4", status: "doing" }]);
  ok("이미 배정된 교재(b1)는 빠진다 · 진도 체크된 교재부터(단어책 2줄 · 영작책 1줄) · 그 다음 영역 이름 차례(독해책)", r.map((x) => x.book_id).join() === "b3,b4,b2" && r[0].progressed && r[0].done === 1 && r[0].marks === 2 && !r[2].progressed);
  ok("배정할 것이 없으면 빈 목록 · 진도 없으면 영역·이름 차례", choiceOrder(books, ["b1", "b2", "b3", "b4"], []).length === 0 && choiceOrder(books, [], []).map((x) => x.book_id).join() === "b3,b2,b1,b4"); }
console.log("■ (어35) 오늘 학습 차례 · 검사 먼저 끝난 교재부터 → 다 끝나면 루틴 차례 → 시작한 줄은 앞 · 선생님 ▲▼(원장님 9/15 「숙제검사를 먼저 한 영역이 오늘학습에 먼저 배정 … 학생페이지 타이머 짓는다」)");
{ const R = (id, slot, book, sort, extra = {}) => ({ id, slot, sort, item_id: "i", unit_id: book ? `u-${book}` : null, units: book ? { book_id: book } : null, carry_of: null, off: false, ...extra });
  const rows = [R("d1", "class", "독해", 1), R("d2", "class", "독해", 2), R("m1", "class", "문법", 3), R("m2", "class", "문법", 4), R("f", "class", null, 5, { item_id: null }), R("c", "class", "문법", -50, { carry_of: "x", carry: { slot: "next" } }), R("p", "class", "문법", 900, { carry_of: "y", carry: { slot: "check" } }), R("h1", "home", "독해", 1), R("h2", "home", "문법", 2)];
  const books = [{ book_id: "독해", from_date: "2025-12-01", books: { area: "독해", name: "독해책" } }, { book_id: "문법", from_date: "2026-01-01", books: { area: "문법", name: "문법책" } }, { book_id: "단어", from_date: "2026-01-01", books: { area: "단어", name: "단어책" } }];
  const rank = bookRank(books);
  ok("교재 등수 · 영역 차례(문법 → 독해 → 단어) · 배정 시작일보다 영역이 먼저", rank.get("문법") === 0 && rank.get("독해") === 1 && rank.get("단어") === 2);
  const apply = (rs, ups) => rs.map((r) => ({ ...r, sort: ups.find((u) => u.id === r.id)?.sort ?? r.sort }));
  const seq = (rs, slot) => rs.filter((r) => r.slot === slot).sort((a, b) => a.sort - b.sort).map((r) => r.id).join();
  const u1 = orderToday(rows, rank), a1 = apply(rows, u1);
  ok("학원 · 넘어온 줄(c) → 문법(m1 m2) → 독해(d1 d2) → 그 밖에(손 줄 f · 검사 나머지 조각 p · 옛 차례) · 숙제도 같은 등수(h2 → h1) · 바뀐 줄만 · 1부터", seq(a1, "class") === "c,m1,m2,d1,d2,f,p" && seq(a1, "home") === "h2,h1" && u1.every((u) => rows.find((r) => r.id === u.id).sort !== u.sort) && a1.filter((r) => r.slot === "class").every((r) => r.sort >= 1), seq(a1, "class") + " | " + seq(a1, "home"));
  ok("다시 돌려도 바뀌는 줄 0(멱등)", orderToday(a1, rank).length === 0);
  const started = rows.map((r) => (r.id === "d2" ? { ...r, started_at: "2026-09-15T10:00:00Z" } : r.id === "d1" ? { ...r, started_at: "2026-09-15T10:05:00Z" } : r));
  const a2 = apply(started, orderToday(started, rank));
  ok("아이가 시작한 줄은 맨 앞 · 시작 차례(d2 → d1) · 그 뒤는 그대로(c → m1 m2 → f p)", seq(a2, "class") === "d2,d1,c,m1,m2,f,p", seq(a2, "class"));
  ok("pin:false 면 시작한 줄도 제 교재 자리(판단만 둔다 · 손은 안 쓴다)", seq(apply(started, orderToday(started, rank, { pin: false })), "class") === "c,m1,m2,d1,d2,f,p");
  ok("readyBooks · 그 교재의 검사 줄이 전부 검사됐을 때만 · 단원 없는 줄(교재 없음)은 어느 교재도 안 막는다 · 검사 줄 없는 교재는 안 나온다", readyBooks([{ status: "done", units: { book_id: "a" } }, { status: "none", units: { book_id: "b" } }, { status: "weak", units: { book_id: "b" } }, { status: null, units: null }, { status: "missing", units: { book_id: "c" } }]).join() === "a,c");
  const bo = bookOrder(books, a1).map((b) => b.book_id).join();
  ok("bookOrder · 01 교재 카드 차례 = 줄의 sort(문법 → 독해) · 줄 없는 교재(단어)는 뒤에 · 07 나무와 같은 차례", bo === "문법,독해,단어", bo);
  ok("bookOrder · 시작한 줄이 앞이면 그 교재가 앞(독해 → 문법)", bookOrder(books, a2).map((b) => b.book_id).join() === "독해,문법,단어"); }
console.log(`\n■ 루틴 깔기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
