/** 항목 줄 글 검사((어27) · 검사-90 · 원장님 2026-09-15 「숙제에 이름없음이라고 되어있는건 뭐지? 교재와 진도, 숙제종류 내지 내용이 있어야함」) · 순수 판단 lib/item-plan.js 한 벌:
 *  제목(항목 이름 › 손 글 › 단원) · 밑줄(교재 · 대단원 › 소단원 · 쪽 · 문항 · 「이번에 …」 · 메모) · 단원 여럿 한 줄 · 한 줄 글(칩·사유) ·
 *  글을 만드는 자리가 다시 흩어지지 않나 · 판(day_item)을 그리는 파일에 「(이름 없음)」 0 · 항목 이름·손 글을 제 손으로 잇는 자리 0(app·lib 전체) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { itemTitle, itemSub, itemLine, unitBits, unitsText, pagesText } from "../lib/item-plan.js";
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
ok("한 줄 글(늦귀가 사유 칩) · 제목 · 손 글(제목과 다를 때만)", itemLine({ learn_items: { name: "교재" }, range_note: "CHAPTER 1 · 10-18번" }) === "교재 · CHAPTER 1 · 10-18번" && itemLine({ range_note: "워크북" }) === "워크북" && itemLine(laid) === "zz_워크북 복습");
console.log("■ 글을 만드는 자리는 하나 · 다시 흩어지면 여기서 잡는다");
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : files(p)) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const src = [...files("app"), ...files("lib")].filter((p) => p !== "lib/item-plan.js").map((p) => [p, readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1")]);
const sheetFiles = src.filter(([, s]) => /day_item|range_note/.test(s)).map(([p]) => p);
const stray = src.filter(([p, s]) => sheetFiles.includes(p) && s.includes("(이름 없음)")).map(([p]) => p);
ok(`판(day_item)을 그리는 파일 ${sheetFiles.length}개에 「(이름 없음)」 0`, sheetFiles.length >= 8 && stray.length === 0, stray.join(" · "));
const hand = src.filter(([, s]) => /learn_items\??\.name\s*(\?\?|\|\|)|range_note\s*(\?\?|\|\|)\s*[\w.]*\??\.learn_items|units\??\.chapter\}?\s*›|\.chapter\s*\+\s*["'`] ›/.test(s)).map(([p]) => p);
ok("항목 이름·손 글·단원을 제 손으로 잇는 자리 0(app · lib · lib/item-plan.js 만)", hand.length === 0, hand.join(" · "));
console.log(`\n■ 항목 줄 글 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
