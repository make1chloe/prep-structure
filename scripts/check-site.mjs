/** 🏫 학교 홈페이지 받아오기 검사((버2) · 검사-81) — 나이스에 없는 학교의 학사일정.
 *  이 길이 위험한 까닭은 **판단을 두 벌로 만들기 쉬워서**다(나이스에 있는 것을 홈페이지용으로 또 짜는 것).
 *  그래서 여기서 지키는 것은 하나 — **새 판단이 없다.** 꼴 옮기기만 새것이고, 나머지는 lib/neis-plan.js 그대로. */
import { readFileSync } from "node:fs";
import { readDate, readSite, toNeisShape, staleText, MAX_ROWS } from "../lib/site-plan.js";
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 주석 먼저(폰-5)
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const src = (f) => strip(readFileSync(f, "utf8"));

console.log("■ 글에서 날짜 하나 — 학교마다 적는 꼴이 다르다");
ok("네 꼴 다 읽는다 — 2026-05-04 · 2026.5.4 · 2026년 5월 4일 · 5/4(해는 학년도로 채운다)",
  readDate("2026-05-04 중간") === "2026-05-04" && readDate("2026.5.4 중간") === "2026-05-04"
  && readDate("2026년 5월 4일") === "2026-05-04" && readDate("5/4 중간", { year: 2026 }) === "2026-05-04",
  [readDate("2026-05-04 중간"), readDate("2026.5.4 중간"), readDate("2026년 5월 4일"), readDate("5/4 중간", { year: 2026 })].join(" · "));
ok("**학년도로 채운다** — 3월~12월은 그 해, 1·2월은 다음 해(「1/15」 가 지난 1월이 되면 안 된다)",
  readDate("1/15", { year: 2026 }) === "2027-01-15" && readDate("9/1", { year: 2026 }) === "2026-09-01");
ok("없는 날짜는 **안 만든다** — 2월 30일 · 13월 · 날짜가 없는 줄은 null(거짓 회차가 서지 않는다)",
  readDate("2026-02-30") === null && readDate("2026-13-01") === null && readDate("학사일정 안내") === null && readDate("5/4") === null);

console.log("■ 못 쓸 줄은 막지 않고 버린다 · 상한");
{ const r = readSite({ rows: ["2026-05-04 1학기 중간고사", "메뉴", "  ", { text: "기말", date: "2026-07-08" }] }, { year: 2026 });
  ok("날짜가 있는 줄만 남고, 날짜 없는 줄은 **까닭과 함께 버린다**(한 줄이 나빠도 나머지는 들어간다)",
    r.rows.length === 2 && r.dropped.length === 1, JSON.stringify(r).slice(0, 200));
  ok("이름에서 날짜 글자를 걷어 낸다 — 「2026-05-04 1학기 중간고사」 → 「1학기 중간고사」", r.rows[0].EVENT_NM === "1학기 중간고사", r.rows[0].EVENT_NM);
  ok("확장이 준 **기계 날짜**가 있으면 그것을 쓴다(달력 꼴은 글에 날짜가 없다)", r.rows[1].AA_YMD === "20260708", r.rows[1].AA_YMD); }
{ let threw = false; try { readSite({ rows: Array.from({ length: MAX_ROWS + 1 }, () => "x") }); } catch { threw = true; }
  ok(`한 번에 ${MAX_ROWS}줄까지 — 넘으면 던진다(확장이 폭주해도 DB 가 안 눕는다) · rows 가 없으면 던진다`, threw && (() => { try { readSite({}); return false; } catch { return true; } })()); }

console.log("■ **새 판단이 없다** — 나이스와 같은 길로 들어온다(원칙-1)");
ok("꼴 옮기기가 나이스 줄과 같다 — planImport 가 그대로 먹는다(AA_YMD · EVENT_NM)", (() => { const r = toNeisShape("2026-05-04", "중간"); return r.AA_YMD === "20260504" && r.EVENT_NM === "중간" && "SBTR_DD_SC_NM" in r; })());
{ const site = src("lib/site.js"), plan = src("lib/site-plan.js");
  ok("무엇이 시험인지·이름·기간·옛 줄에 잇기는 **lib/neis-plan.js 것을 그대로** 쓴다(홈페이지용으로 또 짜지 않는다)",
    /from "\.\/neis-plan\.js"/.test(site) && /planImport/.test(site) && /diffExams/.test(site)
    && !/kindOf|examName|mergeRuns/.test(plan));
  ok("**전국 회차는 홈페이지에서 안 만든다** — 나이스가 준다(두 벌이 된다)", /scope !== "national"/.test(site));
  ok("영어 시험일은 안 넣는다 — 홈페이지가 안 알려 준다(원장님이 12b 에서 찍으신다)", !/english_on:/.test(site));
  ok("쓰는 손은 lib/site.js 하나 · 받는 길은 app/api/site/route.js 하나(대전제-7)", (() => {
    const route = src("app/api/site/route.js");
    return /receiveSite/.test(route) && /authorization/i.test(route) && !/from\("exams"\)/.test(route); })());
  ok("열쇠는 🃏 와 **같은 한 벌** — 원장님이 열쇠를 하나만 챙기신다 · 답에 안 실린다(대전제-9)", (() => {
    const route = src("app/api/site/route.js");
    return /ccToken/.test(route) && /sameToken/.test(route) && !/token[^s]*\}\)/.test(route.replace(/ccToken|sameToken/g, "")); })()); }

console.log("■ 조용히 멈추면 앱이 먼저 말한다(목업 12b)");
ok("마지막으로 받은 때로 「N일째 못 받았습니다」 — 아직이면 그렇게 · 최근이면 아무 말도 안 한다",
  staleText(null, "2026-09-11") === "아직 한 번도 못 받았습니다" && /41일째/.test(staleText("2026-08-01", "2026-09-11") ?? "") && staleText("2026-09-10", "2026-09-11") === null);
{ const board = src("app/schedule/import/board.js");
  ok("12b 가 학교 줄마다 그것을 보인다(받은 때 · 오래되면 빨갛게)", /data-g="site-seen"/.test(board) && /data-g="site-stale"/.test(board) && /staleText/.test(board)); }
console.log(`\n■ 학교 홈페이지 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
