/** 항목 줄 글 검사((어27) · 검사-90 · 원장님 2026-09-15 「숙제에 이름없음이라고 되어있는건 뭐지? 교재와 진도, 숙제종류 내지 내용이 있어야함」) · 순수 판단 lib/item-plan.js 한 벌:
 *  제목(항목 이름 › 손 글 › 단원) · 밑줄(교재 · 대단원 › 소단원 · 쪽 · 문항 · 「이번에 …」 · 메모) · 단원 여럿 한 줄 · 한 줄 글(칩·사유) ·
 *  글을 만드는 자리가 다시 흩어지지 않나 · 판(day_item)을 그리는 파일에 「(이름 없음)」 0 · 항목 이름·손 글을 제 손으로 잇는 자리 0(app·lib 전체) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { itemTitle, itemSub, itemLine, unitBits, unitsText, pagesText } from "../lib/item-plan.js";
import { splitChecks, itemOrder, unitTree, itemForest } from "../lib/day-plan.js";   // (어30)(어32) 줄 차례 · 교재 → 단원 → 활동 · 단원 나무 · (어42) 영역·교재 마디
import { AREA_NAMES } from "../lib/book-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const book = { name: "zz_리허설 문법책" };
const u3 = { chapter: "CHAPTER 1", short: "PSS 1-3 간접의문문 Ⅰ", label: "C1 PSS 1-3 간접의문문 Ⅰ", page_start: 12, page_end: 12, q_count: 12, books: book };
const u4 = { chapter: "CHAPTER 1", short: "PSS 1-4 간접의문문 Ⅱ", label: "C1 PSS 1-4 간접의문문 Ⅱ", page_start: 13, page_end: 14, q_count: 15, books: book };
const laid = { item_id: "i", unit_id: "u", learn_items: { name: "zz_워크북 복습" }, units: u3, range_note: null, memo: null };
console.log("■ 제목 · 숙제 종류(항목 이름) › 손으로 쓴 글 › 단원 이름 · 「(이름 없음)」은 없다");
ok("루틴이 깐 줄(항목 · 단원 · 손 글 없음) → 제목은 항목 이름 · 이것이 「(이름 없음)」으로 서던 줄", itemTitle(laid) === "zz_워크북 복습");
ok("손으로 쓴 줄 → 그 글 · 단원만 있는 줄 → 단원 이름(label › short) · 앞뒤 빈칸은 걷는다", itemTitle({ range_note: " 클카 문장훈련 · PSS 1-3 " }) === "클카 문장훈련 · PSS 1-3" && itemTitle({ units: u3 }) === "C1 PSS 1-3 간접의문문 Ⅰ" && itemTitle({ units: { short: "PSS" } }) === "PSS");
ok("항목 이름이 손 글보다 먼저(검사 줄 · 07 · 09 가 같은 제목) · 셋 다 비면 「(빈 줄)」(앱은 못 만든다)", itemTitle({ ...laid, range_note: "1-20번" }) === "zz_워크북 복습" && itemTitle({}) === "(빈 줄)" && itemTitle(null) === "(빈 줄)" && itemTitle({ range_note: "  " }) === "(빈 줄)");
console.log("■ 밑줄 · 교재 · 대단원 › 소단원 · 쪽 · 문항 · 「이번에 …」 · 메모");
ok("루틴이 깐 줄 → 교재 · 대단원 › 소단원 · 쪽 · 문항 (원장님 「교재와 진도」)", itemSub(laid) === "zz_리허설 문법책 · CHAPTER 1 › PSS 1-3 간접의문문 Ⅰ · p.12 · 12문항");
ok("손 글이 있으면 「이번에 …」 · 메모는 맨 뒤 · 학부모 화면은 memo:false · 교재 카드 안은 book:false", itemSub({ ...laid, range_note: "1-20번", memo: " 빨리 " }) === "zz_리허설 문법책 · CHAPTER 1 › PSS 1-3 간접의문문 Ⅰ · p.12 · 12문항 · 이번에 1-20번 · 빨리" && itemSub({ ...laid, memo: "빨리" }, { memo: false }) === "zz_리허설 문법책 · CHAPTER 1 › PSS 1-3 간접의문문 Ⅰ · p.12 · 12문항" && itemSub(laid, { book: false }) === "CHAPTER 1 › PSS 1-3 간접의문문 Ⅰ · p.12 · 12문항");
ok("손 글이 제목인 줄(단원 있음) → 단원 글만(「이번에」 안 겹침) · 단원 없는 손 글 → 밑줄 없음(메모만) · 교재 이름이 없어도 선다", itemSub({ range_note: "zz_그저께 단어 20개", units: u3 }) === "zz_리허설 문법책 · CHAPTER 1 › PSS 1-3 간접의문문 Ⅰ · p.12 · 12문항" && itemSub({ range_note: "클카" }) === "" && itemSub({ range_note: "클카", memo: "천천히" }) === "천천히" && itemSub({ ...laid, units: { ...u3, books: null } }) === "CHAPTER 1 › PSS 1-3 간접의문문 Ⅰ · p.12 · 12문항");
ok("쪽 · 시작=끝이면 p.12 · 다르면 p.13-14 · 없으면 null", pagesText(u3) === "p.12" && pagesText(u4) === "p.13-14" && pagesText({}) === null && pagesText(null) === null);
console.log("■ 단원 여럿 · 한 줄 글");
ok("단원 여럿(01 학습·숙제 한 줄) → 대단원 한 번 › 소단원들 · 쪽들 · 문항 합 · 조각(unitBits)으로도", unitsText([u3, u4], { book: false }) === "CHAPTER 1 › PSS 1-3 간접의문문 Ⅰ · PSS 1-4 간접의문문 Ⅱ · p.12 · p.13-14 · 27문항" && unitsText([u3, u4]).startsWith("zz_리허설 문법책 · ") && unitBits([u3, u4], { book: false }).q === "27문항" && unitBits([]) === null && unitsText([]) === "");
ok("한 줄 글(하원 지연 사유 칩) · 제목 · 손 글(제목과 다를 때만)", itemLine({ learn_items: { name: "교재" }, range_note: "CHAPTER 1 · 10-18번" }) === "교재 · CHAPTER 1 · 10-18번" && itemLine({ range_note: "워크북" }) === "워크북" && itemLine(laid) === "zz_워크북 복습");
console.log("■ 글을 만드는 자리는 하나 · 다시 흩어지면 여기서 잡는다");
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : files(p)) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const src = [...files("app"), ...files("lib")].filter((p) => p !== "lib/item-plan.js").map((p) => [p, readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1")]);
const sheetFiles = src.filter(([, s]) => /day_item|range_note/.test(s)).map(([p]) => p);
const stray = src.filter(([p, s]) => sheetFiles.includes(p) && s.includes("(이름 없음)")).map(([p]) => p);
ok(`판(day_item)을 그리는 파일 ${sheetFiles.length}개에 「(이름 없음)」 0`, sheetFiles.length >= 8 && stray.length === 0, stray.join(" · "));
const hand = src.filter(([, s]) => /learn_items\??\.name\s*(\?\?|\|\|)|range_note\s*(\?\?|\|\|)\s*[\w.]*\??\.learn_items|units\??\.chapter\}?\s*›|\.chapter\s*\+\s*["'`] ›/.test(s)).map(([p]) => p);
ok("항목 이름·손 글·단원을 제 손으로 잇는 자리 0(app · lib · lib/item-plan.js 만)", hand.length === 0, hand.join(" · "));
console.log("■ (어30)(어32) 줄 차례 · 교재 → 단원 → 활동(루틴 차례) → 날짜 · 교재 없는 줄은 맨 끝(원장님 2026-09-15 「단원이 똑같은 것에 대해서는 단원을 먼저 제시하고 그에 대한 활동을 순서대로 나열」)");
{ const d1 = { student_id: "s", date: "2026-09-13" }, d2 = { student_id: "s", date: "2026-09-14" };
  const A = { id: "ua", book_id: "a", sort: 1, chapter: "PART 2", short: "STEP 2 ❷", page_start: 45, page_end: 45, q_count: 10, books: { name: "ㄱ책", area: "문법" } }, A2 = { ...A, id: "ua2", sort: 2, short: "STEP 2 ❸", page_start: 46, page_end: 46, q_count: 12 }, B = { id: "ub", book_id: "b", sort: 1, chapter: "UNIT 1", short: "1-1", books: { name: "ㄴ책", area: "독해" } };
  const rows = [
    { id: "1", item_id: "w", units: A, sort: 3, day_sheet: d1 },   // ㄱ책 · ❷ · 워크북(둘째 줄) · 13일
    { id: "2", item_id: "v", units: B, sort: 5, day_sheet: d1 },   // ㄴ책 · 13일
    { id: "3", item_id: "n", units: A, sort: 2, day_sheet: d1 },   // ㄱ책 · ❷ · 문답노트(첫 줄) · 13일
    { id: "4", item_id: "n", units: A2, sort: 4, day_sheet: d2 },  // ㄱ책 · ❸(다음 단원) · 문답노트 · 14일
    { id: "5", item_id: "w", units: A, sort: 5, day_sheet: d2 },   // ㄱ책 · ❷ · 워크북 · 14일
    { id: "6", item_id: null, units: A, sort: 9, day_sheet: d1, range_note: "손으로" },   // ㄱ책 · ❷ · 손으로 낸 줄 → 그 단원 끝
    { id: "7", item_id: null, units: null, sort: 1, day_sheet: d1, range_note: "교재 없음" },   // 교재 없음 → 맨 끝
  ];
  const all = [...rows, { id: "0", item_id: "n", units: A, sort: 1, day_sheet: d1 }];   // 13일 ㄱ책 첫 줄(이미 검사함)도 차례 셈에 든다
  ok("ㄱ책 ❷(문답노트 13일 → 워크북 13·14일 → 손 줄) → ❸(문답노트 14일) → ㄴ책 → 교재 없는 줄 · 단원이 활동보다 먼저 · 날짜는 맨 뒤", itemOrder(rows, all).map((r) => r.id).join() === "3,1,5,6,4,2,7", itemOrder(rows, all).map((r) => r.id).join());
  ok("같은 활동이면 단원 차례(❷ → ❸) · all 을 안 주면 rows 로 센다 · 빈 목록도 산다 · 원본은 안 건드린다", itemOrder([]).length === 0 && itemOrder([rows[3], rows[2]]).map((r) => r.id).join() === "3,4" && rows[0].id === "1");
  const tree = unitTree(rows, all);
  ok("단원 나무: 교재·대단원 → 단원(쪽·문항은 단원마다) → 활동 · [ㄱ책 PART 2: ❷ 4줄 · ❸ 1줄] [ㄴ책 UNIT 1: 1-1 1줄] [없음 1줄]", JSON.stringify(tree.map((ch) => [ch.book, ch.chapter, ch.units.map((g) => [g.unit?.short ?? null, g.rows.length])])) === JSON.stringify([["ㄱ책", "PART 2", [["STEP 2 ❷", 4], ["STEP 2 ❸", 1]]], ["ㄴ책", "UNIT 1", [["1-1", 1]]], [null, null, [[null, 1]]]]) && pagesText(tree[0].units[0].unit) === "p.45" && pagesText(tree[0].units[1].unit) === "p.46", JSON.stringify(tree.map((ch) => [ch.book, ch.chapter, ch.units.map((g) => [g.unit?.short ?? null, g.rows.length])])));
  ok("(어32) 단원 머리 아래 줄은 단원 글을 뺀다(itemSub unit:false · 「이번에 …」·메모만)", itemSub({ ...laid, range_note: "1-20번" }, { unit: false }) === "이번에 1-20번" && itemSub(laid, { unit: false }) === "" && itemSub(laid).includes("CHAPTER 1 › PSS 1-3"));
  const dayJs = readFileSync("lib/day.js", "utf8"), rowJs = readFileSync("app/today/row.js", "utf8");
  ok("한 벌: lib/day.js 가 끌어올 때(notYetChecked · 검사한 줄까지 넣고 센다)와 판을 깎을 때(shape) 다 itemOrder · 읽기에 단원 글·sort · 01 검사 카드 · 학습·숙제 카드는 (어42) 나무 부품 ItemTree(제 손 머리 0)", /return itemOrder\(\(h\.data \?\? \[\]\)\.filter\(\(x\) => !done\.has\(x\.id\)\), h\.data \?\? \[\]\)/.test(dayJs) && /check: itemOrder\(by\("check"\)\)/.test(dayJs) && (dayJs.match(/units\(id,book_id,chapter,page_start,page_end,q_count,label,short,sort,books\(name,area\)\)/g) ?? []).length === 2 && /<ItemTree rows=\{parts\.live\} all=\{sheet\.check\}/.test(rowJs) && /<ItemTree rows=\{rows\} book=\{false\}/.test(rowJs) && !/unitTree\(/.test(rowJs) && !/bookGroups|checkOrder/.test(rowJs + dayJs));
  console.log("■ (어42) 항목 나무 한 벌 · 영역 › 📕 교재 › ▸ 단원 › 활동(원장님 9/15 「영역을 봐야 책을 보고 책을 봐야 단원을 보고 단원을 펼쳐봐야 항목검사를 할 거 아냐」)");
  const f = itemForest(rows, all);
  ok("나무: [문법 ㄱ책: PART 2(❷·❸)] [독해 ㄴ책: UNIT 1(1-1)] [그 밖에] · 영역·교재 마디 위에 unitTree 그대로", JSON.stringify(f.map((b) => [b.area, b.book, b.chapters.map((ch) => [ch.chapter, ch.units.map((g) => g.unit?.short ?? null)])])) === JSON.stringify([["문법", "ㄱ책", [["PART 2", ["STEP 2 ❷", "STEP 2 ❸"]]]], ["독해", "ㄴ책", [["UNIT 1", ["1-1"]]]], [null, null, [[null, [null]]]]]), JSON.stringify(f.map((b) => [b.area, b.book])));
  ok("빈 목록 → 빈 나무 · 영역 없는 교재도 마디가 선다 · 원본은 안 건드린다", itemForest([]).length === 0 && itemForest([{ id: "x", units: { id: "u", chapter: "C", short: "s", books: { name: "책" } }, sort: 1 }])[0].book === "책" && rows[0].id === "1");
  const treeJs = readFileSync("app/_shell/tree.js", "utf8"), users = src.filter(([, s]) => /<ItemTree\b/.test(s)).map(([p]) => p), uses = src.reduce((n, [, s]) => n + (s.match(/<ItemTree\b/g) ?? []).length, 0);
  ok("부품 한 벌 app/_shell/tree.js · itemForest 로 · 영역 띠 data-area · 📕 교재(tree-book) · ▸ 단원은 details(tree-unit · 접기) · 머리 summary(tree-head) · 줄은 부르는 쪽(row)", /itemForest/.test(treeJs) && /data-area=/.test(treeJs) && /data-g="tree-book"/.test(treeJs) && /<details[^>]*data-g="tree-unit"/.test(treeJs) && /<summary[^>]*data-g="tree-head"/.test(treeJs) && /row\(it, i, g, ch\)/.test(treeJs));
  ok(`소비처 ≥ 5(01 검사·학습·숙제 · 07 셋 · 09) · 지금 ${uses}곳 ${users.length}파일 · 01 에 제 손 단원 머리(hw-book · unit-head) 0`, uses >= 5 && ["app/today/row.js", "app/me/page.js", "app/parent/page.js"].every((p) => users.includes(p)) && !/hw-book|hw-unit|unit-block|unit-head|chapter-head/.test(rowJs), users.join(" · "));
  const css = readFileSync("app/globals.css", "utf8");
  ok("영역 색은 CSS 한 곳([data-area=…] --tr · 목업 CSS → globals) · 일곱 영역 다 있다 · 접힘 표시 ▸ 회전", AREA_NAMES.every((a) => css.includes(`[data-area="${a}"]{--tr:`)) && /\.tr\{border-left:4px solid var\(--tr/.test(css) && /\.tru\[open\]>summary \.ar/.test(css), AREA_NAMES.filter((a) => !css.includes(`[data-area="${a}"]{--tr:`)).join(",")); }
console.log("■ (어51) 검사 줄 나누기 splitChecks(원장님 9/16 「검사완료된걸 클릭하니까 위에 새로운 내용으로 다시 생기는거 구조가 비논리적이야 · 순서도 뒤엉켜잇어」 → 검사해도 줄은 제자리 · 차례를 바꾸는 것은 교재 보류 하나뿐)");
{ const U = (id, book) => ({ id, book_id: book, chapter: "C", short: id, sort: 1, books: { name: book, area: "문법" } });
  const rs = [{ id: "a", status: "none", item_id: "i", unit_id: "u1", units: U("u1", "b1"), sort: 1 }, { id: "b", status: "done", item_id: "i", unit_id: "u1", units: U("u1", "b1"), sort: 2 }, { id: "c", status: "weak", done_note: "절반", item_id: "j", unit_id: "u2", units: U("u2", "b2"), sort: 3 }, { id: "d", status: "none", item_id: "i", unit_id: "u3", units: U("u3", "b3"), sort: 4 }, { id: "e", status: null, item_id: null, unit_id: null, units: null, sort: 5 }];
  const r = splitChecks(rs, { stopped: new Set(["b3"]) });
  ok("검사한 줄(b·c)도 들어온 차례 그대로 live(a,b,c,e) · 보류 교재(b3)의 줄만 맨 밑 stopped(d) · 교재 없는 줄(e)도 live", r.live.map((x) => x.id).join() === "a,b,c,e" && r.stopped.map((x) => x.id).join() === "d", JSON.stringify({ live: r.live.map((x) => x.id), stopped: r.stopped.map((x) => x.id) }));
  ok("아무것도 안 주면 다섯 줄이 그대로 live(검사 여부로는 자리를 안 옮긴다) · stopped 0 · 빈 목록도 산다", splitChecks(rs).live.map((x) => x.id).join() === "a,b,c,d,e" && splitChecks(rs).stopped.length === 0 && splitChecks([]).live.length === 0);
  const rj = readFileSync("app/today/row.js", "utf8");
  ok("(어51) 검사가 끝난 줄은 그 자리에서 한 줄로 접힌다(data-folded) · 이름을 누르면 편다(data-act=unfold · aria-expanded) · 한 번 더 누르면 아예 해제(none) · 접고 펴는 것은 이 줄 안에서만(splitChecks 는 모른다)", /data-folded=\{folded \? "1" : "0"\}/.test(rj) && /data-act="unfold"/.test(rj) && /const folded = Boolean\(st\) && !open/.test(rj) && /next = st === v \? "none" : v/.test(rj) && !/opened/.test(rj));
  const icb = (rj.match(/data-act="line-(?:skip|next|home|class)"[^>]*\{\.\.\.icon\(/g) ?? []).length;
  ok("(어51) 아이콘만 있는 손은 툴팁으로 설명(원장님 9/16 「아이콘으로만 정보를 표시한경우에는 툴팁 … 마우스를 대고 있으면 다음시간으로 미루기, 같이 설명을 띄워」) · 이름·툴팁은 icon() 한 벌(app/_shell/icon.js) · 줄 손 여섯 · ○△✕ 는 CHECK_TIP 로 「다시 누르면 해제」까지", /\{\.\.\.icon\(CHECK_NAME\[v\], CHECK_TIP\[v\]\)\}/.test(rj) && /icon\("다음 시간", "다음 시간으로 미루기"\)/.test(rj) && icb === 6, String(icb));
  ok("(어51)(어68) 검사 카드에서 그 자리에서 숙제 배정 · 단추는 **늘** 선다(원장님 9/16 「검사'할' 숙제가 없는게 제일큰 문제야」 · 9/17 「기존 숙제가 있어도 추가 할 수 있게 … 하나 추가하고 나면 배정버튼 자체가 사라져서 할 수가 없어」 · 대전제-26) · 0줄일 때만 「검사할 숙제 없음」 빈 상태 글", /data-g="check-none"/.test(rj) && /data-act="give-here"/.test(rj) && /data-act="assign-here"/.test(rj) && /<AssignModal studentId=\{sheet\.student_id\}/.test(rj) && /<GiveModal sheet=\{sheet\} slot=\{giveHere\}/.test(rj)); }
console.log(`\n■ 항목 줄 글 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
