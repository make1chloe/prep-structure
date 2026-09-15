/** 항목 줄 글 검사((어27) · 검사-90 · 원장님 2026-09-15 「숙제에 이름없음이라고 되어있는건 뭐지? 교재와 진도, 숙제종류 내지 내용이 있어야함」) · 순수 판단 lib/item-plan.js 한 벌:
 *  제목(항목 이름 › 손 글 › 단원) · 밑줄(교재 · 대단원 › 소단원 · 쪽 · 문항 · 「이번에 …」 · 메모) · 단원 여럿 한 줄 · 한 줄 글(칩·사유) ·
 *  글을 만드는 자리가 다시 흩어지지 않나 · 판(day_item)을 그리는 파일에 「(이름 없음)」 0 · 항목 이름·손 글을 제 손으로 잇는 자리 0(app·lib 전체) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { itemTitle, itemSub, itemLine, unitBits, unitsText, pagesText } from "../lib/item-plan.js";
import { itemOrder, unitTree } from "../lib/day-plan.js";   // (어30)(어32) 줄 차례 · 교재 → 단원 → 활동 · 단원 나무
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
  const A = { id: "ua", book_id: "a", sort: 1, chapter: "PART 2", short: "STEP 2 ❷", page_start: 45, page_end: 45, q_count: 10, books: { name: "ㄱ책" } }, A2 = { ...A, id: "ua2", sort: 2, short: "STEP 2 ❸", page_start: 46, page_end: 46, q_count: 12 }, B = { id: "ub", book_id: "b", sort: 1, chapter: "UNIT 1", short: "1-1", books: { name: "ㄴ책" } };
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
  ok("한 벌: lib/day.js 가 끌어올 때(notYetChecked · 검사한 줄까지 넣고 센다)와 판을 깎을 때(shape) 다 itemOrder · 읽기에 단원 글·sort · 01 검사 카드는 unitTree(교재·대단원 머리 hw-book · 단원 줄 hw-unit) · 학습·숙제 카드도 unitTree(unit-head · 활동 줄 li)", /return itemOrder\(\(h\.data \?\? \[\]\)\.filter\(\(x\) => !done\.has\(x\.id\)\), h\.data \?\? \[\]\)/.test(dayJs) && /check: itemOrder\(by\("check"\)\)/.test(dayJs) && (dayJs.match(/units\(id,book_id,chapter,page_start,page_end,q_count,label,short,sort,books\(name\)\)/g) ?? []).length === 2 && /unitTree\(sheet\.check\)/.test(rowJs) && /data-g="hw-book"/.test(rowJs) && /data-g="hw-unit"/.test(rowJs) && /const tree = unitTree\(rows\)/.test(rowJs) && /data-g="unit-head"/.test(rowJs) && !/bookGroups|checkOrder/.test(rowJs + dayJs)); }
console.log(`\n■ 항목 줄 글 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
