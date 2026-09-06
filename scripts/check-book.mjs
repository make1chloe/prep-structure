/** 교재 · 단원 판단 검사(검사-56) — lib/book-plan.js 순수 셈: 같은 교재 열쇠(판·연도·기호만 없앤다) · 활동 차례(줄 순서에서 저절로) · 목록 줄·알약 · 엑셀 읽기(열 이름 후보 · 교재명 이어받기 · 워크북 · 문항범위 → 개수 · 날짜로 바뀐 것 짚기) · 교재 맞추기(교재ID › 이름 › 다른 이름 › 비슷한 이름 · 후보 둘이면 보류) · 올리면 이렇게 됩니다(새로·바뀜·같음·파일에 없는 기존 줄 · 덮어쓰기 차례 · 지우고 새로 · 건너뛰기 · 묶음은 교재를 따른다) · 엑셀로 */
import { bookKey, activityOrder, listRows, counts, mapHeaders, parseUnitRows, rangeMangled, countRange, matchBooks, planUpload, mergeOrder, batchFor, exportRows, pagesText, AREA_NAMES, MODES } from "../lib/book-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const J = (x) => JSON.stringify(x);
console.log("■ 열쇠 · 활동 차례 · 목록");
ok("같은 교재 열쇠 — 「2025 개정 리딩튜터 (입문)」 = 「리딩튜터 입문」 · 「리딩튜터 기본」은 다르다 · 「능률 1」 ≠ 「능률 2」 · 빈 것은 빈 글자", bookKey("2025 개정 리딩튜터 (입문)") === bookKey("리딩튜터 입문") && bookKey("리딩튜터 입문") !== bookKey("리딩튜터 기본") && bookKey("능률 1") !== bookKey("능률 2") && bookKey("") === "", bookKey("2025 개정 리딩튜터 (입문)"));
ok("활동 차례 — 줄 차례(sort)에서 처음 나오는 순서: 본책 → 워크북 → 단원평가", activityOrder([{ activity: "워크북", sort: 5 }, { activity: "본책", sort: 1 }, { activity: "단원평가", sort: 9 }, { activity: "본책", sort: 2 }]).join(",") === "본책,워크북,단원평가");
const books = [{ id: "b1", code: "G023", name: "중등3800제3", area: "문법", state: "active", units: 18, students: 5, aliases: ["중등 3800제 3권", "3800제3"] }, { id: "b2", code: null, name: "2026 자이스토리 영어독해 기본", area: null, state: "active", units: 0, students: 0, aliases: [] }, { id: "b3", code: "R011", name: "수능딥독1", area: "독해", state: "stopped", units: 12, students: 0, aliases: [] }];
ok("목록 줄 — 영역으로 거른다 · 단원 없음·영역 없음 표시 · 알약(쓰는 교재 2권 · 단원 없음 1 · 영역 없음 1 · 영역별)", listRows(books, "문법").length === 1 && listRows(books)[1].noUnits && listRows(books)[1].noArea && listRows(books)[0].sub === "G023 · 문법" && J(counts(books)) === J({ total: 2, noUnits: 1, noArea: 1, byArea: Object.fromEntries(AREA_NAMES.map((a) => [a, a === "문법" ? 1 : 0])) }), J(counts(books)));
console.log("■ 엑셀 읽기");
ok("머리줄 — 「교재명·대단원·중 단원·소단원·활동명·시작 페이지·끝p·문항 수·문항범위」 → 우리 이름 · 완전히 같은 것을 먼저(「문항범위」가 「문항」에 안 뺏긴다) · 모르는 열 null", J(mapHeaders(["교재명", "대단원", "중 단원", "소단원", "활동명", "시작 페이지", "끝p", "문항 수", "문항범위", "비고"])) === J(["book", "chapter", "mid", "sub", "activity", "page_start", "page_end", "q_count", "q_range", null]), J(mapHeaders(["교재명", "대단원", "중 단원", "소단원", "활동명", "시작 페이지", "끝p", "문항 수", "문항범위", "비고"])));
const sheet = [
  { 교재명: "중등3800제3", 대단원: "CH 8 관계사", 중단원: "PSS 8-1", 소단원: "관계대명사 who", 활동명: "개념·문제", 시작페이지: "p.96", 끝페이지: "", 문항수: "14", 문항범위: "" },
  { 교재명: "", 대단원: "", 중단원: "PSS 8-2", 소단원: "관계대명사 which", 활동명: "개념·문제", 시작페이지: "97", 끝페이지: "97", 문항수: "", 문항범위: "1-16" },
  { 교재명: "", 대단원: "", 중단원: "Practice", 소단원: "", 활동명: "워크북", 시작페이지: "99", 끝페이지: "101", 문항수: "", 문항범위: "2026-01-25" },
  { 교재명: "", 대단원: "", 중단원: "", 소단원: "", 활동명: "", 시작페이지: "", 끝페이지: "", 문항수: "", 문항범위: "" },
  { 교재명: "쓰작1", 대단원: "UNIT 1", 중단원: "", 소단원: "1-1", 활동명: "", 시작페이지: "", 끝페이지: "", 문항수: "3", 문항범위: "" },
];
const parsed = parseUnitRows(sheet);
ok("줄 읽기 — 교재명·대단원이 비면 위 줄을 잇는다 · 이름 될 값이 없는 줄은 버린다(4줄) · 쪽 「p.96」 → 96 · 문항범위 1-16 → 16문항 · 워크북 활동은 워크북 · 활동명 비면 「본책」 · 날짜로 바뀐 범위는 짚고(3행) 개수는 안 센다", parsed.rows.length === 4 && parsed.rows[1].book === "중등3800제3" && parsed.rows[1].chapter === "CH 8 관계사" && parsed.rows[0].page_start === 96 && parsed.rows[1].q_count === 16 && parsed.rows[2].is_workbook === true && parsed.rows[2].q_count === null && J(parsed.mangled) === J([4]) && parsed.rows[3].activity === "본책" && parsed.rows[3].line === 6, J(parsed.rows.map((r) => [r.line, r.book, r.chapter, r.mid, r.sub, r.activity, r.q_count])));
ok("날짜 꼴 — 2026-01-25 · 1/25/2026 · 45678 은 망가진 것 · 「1-25」는 아니다 · 개수 「01-06」 6 · 「3,5,7」 3 · 「1~25」 25", rangeMangled("2026-01-25") && rangeMangled("1/25/2026") && rangeMangled("45678") && !rangeMangled("1-25") && countRange("01-06") === 6 && countRange("3,5,7") === 3 && countRange("1~25") === 25 && countRange("") === null);
console.log("■ 교재 맞추기 · 올리면 이렇게 됩니다");
const groups = matchBooks(parsed.rows, books);
ok("교재 맞추기 — 「중등3800제3」 이름 그대로 · 「쓰작1」은 없어 보류(후보 없음)", groups.length === 2 && groups[0].book?.id === "b1" && groups[0].how === "이름" && groups[1].book === null && groups[1].candidates.length === 0, J(groups.map((g) => [g.name, g.book?.id ?? null, g.how])));
ok("다른 이름·교재ID·비슷한 이름으로도 맞는다 · 후보가 둘이면 못 고른다(보류 + 후보)", matchBooks([{ book: "3800제3", chapter: "x" }], books)[0].how === "다른 이름" && matchBooks([{ book: "아무거나", code: "r011", chapter: "x" }], books)[0].how === "교재ID" && matchBooks([{ book: "2025 개정 수능딥독1", chapter: "x" }], books)[0].how === "비슷한 이름" && (() => { const g = matchBooks([{ book: "3800제", chapter: "x" }], [...books, { id: "b4", code: null, name: "고교 3800제", state: "active", aliases: ["3800제"] }, { id: "b5", code: null, name: "중등 3800제", state: "active", aliases: ["3800제"] }])[0]; return g.book === null && g.candidates.length === 2; })());
const existing = [{ id: "u1", chapter: "CH 8 관계사", mid: "PSS 8-1", sub: "관계대명사 who", activity: "개념·문제", is_workbook: false, sort: 1, page_start: 96, page_end: null, q_count: 14, q_range: null, gist: null, import_batch: "import" },
                  { id: "u2", chapter: "CH 8 관계사", mid: "PSS 8-2", sub: "관계대명사 which", activity: "개념·문제", is_workbook: false, sort: 2, page_start: 97, page_end: 97, q_count: 15, q_range: null, gist: null, import_batch: "import" },
                  { id: "u3", chapter: "CH 9 가정법", mid: "PSS 9-1", sub: "가정법 과거", activity: "개념·문제", is_workbook: false, sort: 3, page_start: 110, page_end: null, q_count: 12, q_range: null, gist: null, import_batch: "import" }];
const plan = planUpload(groups, { b1: existing }, {});
const p1 = plan.perBook[0];
ok("덮어쓰기(기본) — 새로 1(Practice) · 바뀜 1(8-2: 15 → 16) · 같음 1(8-1) · 파일에 없는 기존 줄 1(9-1) · 묶음은 교재를 따라 import(검사-⑰) · 보류 1줄", p1.mode === "overwrite" && p1.added === 1 && p1.changed === 1 && p1.same === 1 && p1.untouched === 1 && p1.batch === "import" && plan.holds.length === 1 && plan.holds[0].lines === 1 && J(plan.totals) === J({ added: 1, changed: 1, same: 1, untouched: 1, holds: 1, books: 1 }), J([p1.added, p1.changed, p1.same, p1.untouched, p1.batch, plan.totals]));
ok("덮어쓰기 차례 — 기존 차례를 지키고 새 줄은 같은 대단원 뒤(Practice 는 8-2 뒤 · 9-1 은 그대로 끝) · 전체에 10·20·30·40 · 있던 줄은 id 를 지닌다", J(p1.rows.map((r) => [r.mid ?? r.sub, r.sort, r.id])) === J([["PSS 8-1", 10, "u1"], ["PSS 8-2", 20, "u2"], ["Practice", 30, null], ["PSS 9-1", 40, "u3"]]) && p1.rows[1].q_count === 16, J(p1.rows.map((r) => [r.mid, r.sort, r.id, r.q_count])));
ok("새 대단원은 끝에 · 지우고 새로는 파일 줄만 · 건너뛰기는 줄 없음 · 묶음 excel(기존 없음)", mergeOrder(existing, [{ chapter: "CH 10 분사", sub: "10-1", activity: "본책" }]).at(-1).chapter === "CH 10 분사" && planUpload(groups, { b1: existing }, { b1: "replace" }).perBook[0].rows.length === 3 && planUpload(groups, { b1: existing }, { b1: "skip" }).perBook[0].rows.length === 0 && planUpload(groups, { b1: existing }, { b1: "skip" }).totals.books === 0 && batchFor([]) === "excel" && batchFor([{ import_batch: "fixture" }]) === "excel" && MODES.length === 3);
console.log("■ 엑셀로");
const ex = exportRows(existing, { name: "중등3800제3", code: "G023" });
ok("내보낼 줄 — 올리기 양식과 같은 열 · 차례대로 · 워크북 Y/빈칸 · 「p.96」", Object.keys(ex[0]).join() === "교재명,교재ID,대단원,중단원,소단원,활동명,워크북,시작페이지,끝페이지,문항수,문항범위,핵심내용" && ex[0].교재ID === "G023" && ex[0].워크북 === "" && pagesText(existing[0]) === "p.96" && pagesText({ page_start: 99, page_end: 101 }) === "p.99-101", J(ex[0]));
console.log(`\n■ 교재 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
