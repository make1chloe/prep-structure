/** 시험 회차 판단 검사(검사-54) — lib/exam-plan.js 순수 셈: 보는 아이(학교·학년·안 봄·전국은 고등) · 그날·끝나는 날 · 몇 주 전부터(아이 따로 › 학교급 규칙) · 멈춤 창(영어일 − N주 ~ 끝) · 시험전·시험후 · 범위 묶음 · 알약 · 머리 · 멈춤 글 · 단원 묶기 + routine-plan stopOn 의 「시작 전이면 진행중」 */
import { takes, skipCandidates, examOn, examEnd, weeksFor, stopWindow, examPhase, groupScopes, counts, examHead, stopText, unitsByChapter, manualKey, LEVELS, WEEK_CHOICES } from "../lib/exam-plan.js";
import { stopOn } from "../lib/routine-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const J = (x) => JSON.stringify(x);
const S1 = "s1", S2 = "s2";
const mid = { id: "e1", scope: "school", school_id: "sch1", school: "신정중학교", level: "middle", grade: 2, name: "2학기 중간", term_from: "2026-10-14", term_to: "2026-10-17", english_on: "2026-10-16", state: "active", hidden: false, source: "neis" };
const anyGrade = { ...mid, id: "e2", grade: null, english_on: null };
const nat = { id: "e3", scope: "national", school_id: null, school: null, level: null, grade: 1, name: "10월 학력평가", term_from: "2026-10-14", term_to: "2026-10-14", english_on: "2026-10-14", state: "active", hidden: false, source: "neis" };
const a = { id: S1, name: "강민서", grade: 2, school_id: "sch1", level: "middle", state: "active" }, b = { id: S2, name: "조은채", grade: 1, school_id: "sch2", level: "high", state: "active" }, c = { id: "s3", name: "학교 없음", grade: 2, school_id: null, level: null, state: "active" };
console.log("■ 보는 아이");
ok("학교 회차 — 같은 학교 + 그 학년만(강민서 중2 ○ · 고1 조은채 ✕ · 학교 없는 아이 ✕) · 학년이 비면 그 학교 전부", takes(a, mid) && !takes(b, mid) && !takes(c, mid) && takes(a, anyGrade) && !takes({ ...a, grade: 3 }, mid) && takes({ ...a, grade: 3 }, anyGrade));
ok("전국 — 고등 아이 전부(학년이 적혔으면 그 학년): 고1 조은채 ○ · 중2 강민서 ✕ · 고2 는 ✕", takes(b, nat) && !takes(a, nat) && !takes({ ...b, grade: 2 }, nat) && takes({ ...b, grade: 2 }, { ...nat, grade: null }));
ok("「안 봄」은 뺀다(exam.exam_skip 에서도 · 따로 준 줄에서도 · skipped=false 면 본다) · 숨긴 회차·물린 회차·나간 아이는 안 본다", !takes(a, { ...mid, exam_skip: [{ student_id: S1, skipped: true }] }) && !takes(a, mid, [{ exam_id: "e1", student_id: S1 }]) && takes(a, mid, [{ exam_id: "e9", student_id: S1 }]) && takes(a, { ...mid, exam_skip: [{ student_id: S1, skipped: false }] }) && !takes(a, { ...mid, hidden: true }) && !takes(a, { ...mid, state: "cancelled" }) && !takes({ ...a, state: "left" }, mid));
console.log("■ 날 · 몇 주 · 멈춤 창");
ok("그날 = 영어일(없으면 기간 시작) · 끝나는 날 = 가장 늦은 것", examOn(mid) === "2026-10-16" && examOn(anyGrade) === "2026-10-14" && examEnd(mid) === "2026-10-17" && examEnd({ term_from: "2026-10-14", english_on: "2026-10-20" }) === "2026-10-20" && examEnd({}) === null);
const rules = { "prep.stop_weeks.high": "6", "prep.stop_weeks.middle": "4" };
ok("몇 주 전부터 — 아이 따로(3) › 학교급 규칙(중 4 · 고 6) · 규칙 줄 없으면 null(던지지 않는다)", weeksFor("middle", rules, { stop_weeks: 3 }) === 3 && weeksFor("middle", rules) === 4 && weeksFor("high", rules) === 6 && weeksFor("elem", rules) === null && weeksFor("middle", rules, { stop_weeks: null }) === 4);
ok("멈춤 창 — 영어일 10/16 − 4주 = 9/18 부터 시험 끝 10/17 까지 · 6주면 9/4 · 영어일 없으면 null(모르면 안 세운다) · 주 수 없으면 null", J(stopWindow(mid, 4)) === J({ from: "2026-09-18", until: "2026-10-17" }) && stopWindow(mid, 6).from === "2026-09-04" && stopWindow(anyGrade, 4) === null && stopWindow(mid, null) === null, J(stopWindow(mid, 4)));
ok("stopOn — 창에 묶인 교재는 시작 전이면 진행중 · 안에서는 교재멈춤 · 지나면 진행중 · 손으로 멈춘 것(stop_from 없음)은 그대로", (() => { const sb = { stop_mode: "book_off", stop_from: "2026-09-18", stop_until: "2026-10-17" }; return stopOn(sb, "2026-09-17") === "running" && stopOn(sb, "2026-09-18") === "book_off" && stopOn(sb, "2026-10-17") === "book_off" && stopOn(sb, "2026-10-18") === "running" && stopOn({ stop_mode: "hw_off" }, "2026-09-01") === "hw_off"; })());
console.log("■ 시험전 · 시험후");
ok("영어일 10/16 — 10/9~10/15 는 시험전 · 10/16~10/19 는 시험후 · 10/8 · 10/20 은 아무것도 · 여러 회차면 가까운 것", examPhase([mid], "2026-10-09") === "before" && examPhase([mid], "2026-10-15") === "before" && examPhase([mid], "2026-10-16") === "after" && examPhase([mid], "2026-10-19") === "after" && examPhase([mid], "2026-10-08") === null && examPhase([mid], "2026-10-20") === null && examPhase([mid, { ...nat, english_on: "2026-10-10" }], "2026-10-09") === "before" && examPhase([], "2026-10-09") === null);
ok("날 수는 규칙에서(before 3 · after 1 이면 10/12 는 아무것도 · 10/17 은 시험후 · 10/18 은 아무것도 · 10/14 는 시험전)", examPhase([mid], "2026-10-12", { before: 3, after: 1 }) === null && examPhase([mid], "2026-10-17", { before: 3, after: 1 }) === "after" && examPhase([mid], "2026-10-18", { before: 3, after: 1 }) === null && examPhase([mid], "2026-10-14", { before: 3, after: 1 }) === "before");
console.log("■ 범위 묶음 · 알약 · 머리");
const scopes = [
  { id: "p1", book_id: "b1", book: "공통영어2 능률", unit_id: "u1", chapter: "2과", short: "2-1", added_on: "2026-09-12", removed_on: null },
  { id: "p2", book_id: "b1", book: "공통영어2 능률", unit_id: "u2", chapter: "2과", short: "2-2", added_on: "2026-09-12", removed_on: null },
  { id: "p3", book_id: "b1", book: "공통영어2 능률", unit_id: "u3", chapter: "3과", short: "3-1", added_on: "2026-09-12", removed_on: "2026-09-29" },
  { id: "p4", book_id: "b2", book: "2409 학평", unit_id: "u9", chapter: "22-24", short: "22", added_on: "2026-10-05", removed_on: null },
  { id: "p5", book_id: null, book: null, unit_id: null, chapter: null, short: null, free_note: "학교 프린트 3장", added_on: "2026-09-12", removed_on: null },
];
const g = groupScopes(scopes, "2026-10-06");
ok("교재 × 대단원마다 칩 하나 — 2과(소단원 2 · 산 것) · 3과(9/29 학교가 뺌) · 학평 22-24(10/5 더함) · 글 한 줄(글로 적음) · 칩 넷", g.length === 4 && g[0].title === "공통영어2 능률 2과" && g[0].state === "on" && g[0].sub === "소단원 2" && J(g[0].liveIds) === J(["p1", "p2"]) && g[1].state === "del" && g[1].sub === "9/29 학교가 뺌" && g[2].state === "add" && g[2].sub === "소단원 1 · 10/5 더함" && g[3].title === "학교 프린트 3장" && g[3].sub === "글로 적음", J(g.map((x) => [x.title, x.state, x.sub])));
const exams = [{ ...mid, scopes }, { ...anyGrade, scopes: [] }, { ...nat, scopes: [] }, { ...mid, id: "e4", hidden: true, english_on: null, scopes: [] }, { ...mid, id: "e5", english_on: null, term_to: "2026-08-01", term_from: "2026-07-30", scopes: [] }];
const cnt = counts(exams, "2026-10-06");
ok("알약 — 회차 4(숨긴 것 빼고) · 숨김 1 · 범위 4줄(산 것만) · 영어일 없음 1(학교 회차 · 아직 안 끝난 것 — 숨긴 것·지난 것은 안 센다)", cnt.exams === 4 && cnt.hidden === 1 && cnt.scopes === 4 && cnt.missing === 1 && J(cnt.missingIds) === J(["e2"]), J(cnt));
ok("머리 — 「신정중 · 중2」 · 「신정중 · 전 학년」 · 전국은 이름 그대로", examHead(mid) === "신정중 · 중2" && examHead(anyGrade) === "신정중 · 전 학년" && examHead(nat) === "10월 학력평가");
const win = stopWindow(mid, 4);
ok("멈춤 글 — 아직(9/18부터 멈춤 · 10/17에 저절로 풀림) · 중(멈춤 중) · 지남(10/17에 풀림) · 창 없으면 null", stopText(win, "2026-09-01").state === "soon" && stopText(win, "2026-09-01").text === "9/18부터 멈춤 · 10/17에 저절로 풀림" && stopText(win, "2026-10-01").state === "on" && stopText(win, "2026-10-18").state === "past" && stopText(win, "2026-10-18").text === "10/17에 풀림" && stopText(null, "2026-10-01") === null);
ok("손으로 넣은 회차의 출처 열쇠 — 학교·학년·이름·시작날로(둘째 회차가 (manual, null) 에 걸리던 사고) · 학년·학교 비면 all", manualKey({ scope: "school", schoolId: "s1", grade: 2, name: " 2학기 중간 ", termFrom: "2026-10-14" }) === "manual:school:s1:2:2학기 중간:2026-10-14" && manualKey({ scope: "national", name: "10월 학평", termFrom: "2026-10-14" }) === "manual:national:all:all:10월 학평:2026-10-14" && manualKey({ scope: "school", schoolId: "s1", name: "a", termFrom: "d" }) !== manualKey({ scope: "school", schoolId: "s1", name: "b", termFrom: "d" }));
ok("단원 묶기 — 대단원마다 · 차례 그대로 · 학교급 셋 · 주 후보 넷", J(unitsByChapter([{ id: 1, chapter: "A" }, { id: 2, chapter: "A" }, { id: 3, chapter: "B" }]).map((x) => [x.chapter, x.units.length])) === J([["A", 2], ["B", 1]]) && LEVELS.join() === "high,middle,elem" && WEEK_CHOICES.join() === "3,4,6,8");
ok("안 봄 후보((가)-⑨ 한 번에도 같은 목록) — 보는 아이 가운데 아직 안 봄이 아닌 아이만 · 안 보는 학교 아이는 빠짐 · 빈 것", J(skipCandidates([{ id: "a" }, { id: "b" }, { id: "c" }], ["a", "b"], [{ student_id: "b" }]).map((s) => s.id)) === J(["a"]) && skipCandidates([{ id: "a" }], [], []).length === 0 && skipCandidates(undefined, undefined, undefined).length === 0);
console.log(`\n■ 시험 회차 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
