/** 수강료 판단 검사(검사-53) — lib/fee-plan.js 순수 셈: 단가 줄(학생 › 반 › 학년 기준 · 그 달에 걸친 것만) · 특강은 단가 × 회차(일정 12 와 같은 셈) · 그 달 줄(받은 금액이 있으면 그것) · 상태 셋 · 합계 · 금액을 바꾸면 이 달부터 새 단가 줄(지난달 소급 없음, 처음-1) · 결제선생 엑셀 읽기(열 이름 후보) · 엑셀로 내보낼 줄 · 학년별 기준 양식(초1~고3 · 빈 칸은 안 적음 · 0·음수는 막음) · 수납 방법 넷 · 지난달 안 받음 알약 글 · 입금 확인 한 번에(안 받음 줄 → 받은 날 = 그날 · (가)-⑩) */
import { won, parseWon, gradeKey, ruleFor, suggested, rowsOf, totals, ruleChanges, parseDate, parsePaymentRow, parseSheet, exportRows, parseByGrade, prevUnpaidText, payAllEdits, STATE, GRADE_KEYS, METHODS } from "../lib/fee-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const J = (x) => JSON.stringify(x);
const c1 = { id: "c1", kind: "regular", nickname: null, weekdays: [1, 3], start_time: "17:00:00", sessions: 9, extra: 0 };
const c3 = { id: "c3", kind: "special", nickname: "토 특강", weekdays: [6], start_time: "10:00:00", sessions: 4, extra: 1 };
const A = { id: "a", name: "강민서", grade: 2, level: "middle", classes: [c1] }, B = { id: "b", name: "조은채", grade: 1, level: "high", classes: [c3] }, C = { id: "c", name: "구도은", grade: 3, level: "middle", classes: [] }, D = { id: "d", name: "서예린", grade: 1, level: "elem", classes: [] };
const rules = [
  { id: "r1", student_id: null, class_id: "c1", from_date: "2026-03-01", to_date: null, amount: 360000, per_session: false },
  { id: "r2", student_id: null, class_id: "c3", from_date: "2026-09-01", to_date: null, amount: 45000, per_session: true },
  { id: "r3", student_id: "a", class_id: null, from_date: "2026-06-01", to_date: "2026-08-31", amount: 300000, per_session: false },
];
const byGrade = { "중3": 380000 };
const board = { students: [A, B, C, D], rules, payments: [{ id: "p1", student_id: "a", amount: 360000, paid_on: "2026-10-05", method: "카드" }], by_grade: byGrade };
console.log("■ 돈 글자 · 학년 열쇠");
ok("won — 360000 → 「360,000원」 · 빈 것은 빈 글자 · parseWon 「300,000원」 → 300000 · 빈 것은 null(0원이 아니다)", won(360000) === "360,000원" && won(null) === "" && won("") === "" && parseWon("300,000원") === 300000 && parseWon("") === null && parseWon(undefined) === null);
ok("gradeKey — 옛 설정 tuition.byGrade 의 열쇠 「중2」 「고1」 · 학년 없으면 null", gradeKey("middle", 2) === "중2" && gradeKey("high", 1) === "고1" && gradeKey("elem", 6) === "초6" && gradeKey("middle", null) === null);
console.log("■ 단가 줄 — 학생 › 반 · 그 달에 걸친 것만");
ok("10월의 강민서 — 학생 줄(6~8월)은 닫혀서 반 줄(r1) · 8월엔 학생 줄이 이긴다 · 반 없는 구도은은 없음", ruleFor(A, rules, "2026-10")?.id === "r1" && ruleFor(A, rules, "2026-10").source === "반" && ruleFor(A, rules, "2026-08")?.id === "r3" && ruleFor(A, rules, "2026-08").source === "학생" && ruleFor(C, rules, "2026-10") === null, J([ruleFor(A, rules, "2026-10")?.id, ruleFor(A, rules, "2026-08")?.id]));
ok("제안 — 강민서 360,000(반 단가) · 조은채 특강 45,000 × 5회(회차 4 + 반 보강일 1 = 일정 12 와 같은 셈) = 225,000 · 구도은 학년 기준 중3 380,000 · 서예린은 없음(null — 「아직 안 적음」)", suggested(A, rules, byGrade, "2026-10").amount === 360000 && suggested(A, rules, byGrade, "2026-10").source === "반 단가" && suggested(B, rules, byGrade, "2026-10").amount === 225000 && suggested(B, rules, byGrade, "2026-10").source === "반 단가 45,000원 × 5회" && suggested(B, rules, byGrade, "2026-10").perSession === true && suggested(C, rules, byGrade, "2026-10").amount === 380000 && suggested(C, rules, byGrade, "2026-10").source === "학년 기준 중3" && suggested(D, rules, byGrade, "2026-10").amount === null, J([suggested(A, rules, byGrade, "2026-10"), suggested(B, rules, byGrade, "2026-10"), suggested(C, rules, byGrade, "2026-10")]));
console.log("■ 그 달 줄 · 합계");
const rows = rowsOf(board, "2026-10");
ok("넷 — 강민서 받음(10/5 · 카드 · 「월·수 17:00」) · 조은채 안 받음 225,000(「토 특강」 · 5회 꼬리표) · 구도은 안 받음 380,000(「반 없음」) · 서예린 금액 없음", rows.length === 4 && rows[0].state === "paid" && rows[0].paid_on === "2026-10-05" && rows[0].method === "카드" && rows[0].classText === "월·수 17:00" && rows[1].state === "unpaid" && rows[1].amount === 225000 && rows[1].classText === "토 특강" && J(rows[1].special) === "[5]" && rows[2].state === "unpaid" && rows[2].amount === 380000 && rows[2].classText === "반 없음" && rows[3].state === "none" && rows[3].amount === null, J(rows.map((r) => [r.name, r.state, r.amount, r.classText])));
ok("받은 금액이 있으면 제안 대신 그것(350,000 을 받았으면 350,000 · 제안 360,000 은 따로) · 받은 날 없이 금액만이면 안 받음", (() => { const r = rowsOf({ ...board, payments: [{ id: "p1", student_id: "a", amount: 350000, paid_on: null }] }, "2026-10")[0]; return r.amount === 350000 && r.suggested === 360000 && r.state === "unpaid"; })());
const t = totals(rows);
ok("합계 965,000 · 안 받음 605,000(2명) · 금액 없음 1 · 받음 1 — 청구액은 저장하지 않고 화면이 센다(대전제-5)", t.sum === 965000 && t.unpaid === 605000 && t.unpaidCount === 2 && t.noneCount === 1 && t.paidCount === 1, J(t));
ok("상태 셋 — 받음 · 안 받음 · 금액 없음", Object.values(STATE).join() === "받음,안 받음,금액 없음");
console.log("■ 금액을 바꾸면 단가 줄도 — 이 달부터(처음-1 돈의 이력)");
const none = { close: null, update: null, insert: null };
ok("반 단가와 같은 360,000 · 학년 기준과 같은 380,000 · 비운 것 — 줄을 안 만든다", J(ruleChanges(A, rules, byGrade, "2026-10", 360000)) === J(none) && J(ruleChanges(C, rules, byGrade, "2026-10", 380000)) === J(none) && J(ruleChanges(A, rules, byGrade, "2026-10", null)) === J(none));
ok("강민서 350,000 — 학생 줄을 10/1 부터 새로(닫을 것 없음 · 반 줄은 안 건드림)", J(ruleChanges(A, rules, byGrade, "2026-10", 350000)) === J({ close: null, update: null, insert: { student_id: "a", from_date: "2026-10-01", amount: 350000, per_session: false } }), J(ruleChanges(A, rules, byGrade, "2026-10", 350000)));
const r4 = { id: "r4", student_id: "a", class_id: null, from_date: "2026-09-01", to_date: null, amount: 340000, per_session: false };
ok("살아 있는 학생 줄(9/1~)이 있는데 다른 금액 — 그 줄은 9/30 에 닫고 10/1 부터 새 줄(지난달은 소급 안 됨)", J(ruleChanges(A, [...rules, r4], byGrade, "2026-10", 350000)) === J({ close: { id: "r4", to_date: "2026-09-30" }, update: null, insert: { student_id: "a", from_date: "2026-10-01", amount: 350000, per_session: false } }), J(ruleChanges(A, [...rules, r4], byGrade, "2026-10", 350000)));
ok("같은 달에 만든 학생 줄(10/1~)이면 그 줄의 금액만 고친다 · 금액이 같으면 아무것도", J(ruleChanges(A, [...rules, { ...r4, from_date: "2026-10-01" }], byGrade, "2026-10", 350000)) === J({ close: null, update: { id: "r4", amount: 350000 }, insert: null }) && J(ruleChanges(A, [...rules, r4], byGrade, "2026-10", 340000)) === J(none));
ok("특강 회차제 학생 줄은 안 건드린다(금액은 회차가 정한다)", J(ruleChanges(B, [...rules, { id: "r5", student_id: "b", class_id: null, from_date: "2026-09-01", to_date: null, amount: 50000, per_session: true }], byGrade, "2026-10", 999)) === J(none));
console.log("■ 결제선생 엑셀 읽기 — 열 이름을 정확히 맞추라고 안 한다");
ok("날짜 — 「2026.10.05」 「2026년 10월 5일」 「2026-10-05 14:31」 → 2026-10-05 · 「10/05」는 그 해로 · 빈 것 null", parseDate("2026.10.05") === "2026-10-05" && parseDate("2026년 10월 5일") === "2026-10-05" && parseDate("2026-10-05 14:31") === "2026-10-05" && parseDate("10/05", 2026) === "2026-10-05" && parseDate("", 2026) === null);
const row1 = parsePaymentRow({ "학생 이름": "강민서", "결제일시": "2026-10-05 14:31", "결제 금액": "360,000", "결제상태": "결제완료", "결제수단": "카드", "청구월": "2026-10" }, 2026);
ok("한 줄 — 이름(띄어쓴 열 이름도) · 달 · 360,000 · 받은 날 · 카드 · 받음", row1.name === "강민서" && row1.ym === "2026-10" && row1.amount === 360000 && row1.paidOn === "2026-10-05" && row1.method === "카드" && row1.paid === true, J(row1));
const row2 = parsePaymentRow({ "이름": "조은채", "상태": "미납", "금액": "225000", "월": "10월" }, 2026);
ok("미납 줄 — 받은 날 없음 · 안 받음 · 「10월」은 그 해 10월", row2.paid === false && row2.paidOn === null && row2.amount === 225000 && row2.ym === "2026-10", J(row2));
ok("날짜만 있고 상태가 없으면 받음 · 달 열이 없으면 받은 날의 달", (() => { const r = parsePaymentRow({ "성명": "구도은", "납부일": "2026-10-07", "납부금액": "380000" }, 2026); return r.paid === true && r.ym === "2026-10"; })());
ok("시트 — 이름 없는 줄(합계 줄 따위)은 버린다", parseSheet([{ "학생명": "강민서", "금액": "1" }, { "학생명": "", "금액": "999999" }, { "비고": "합계" }], 2026).length === 1);
console.log("■ 엑셀로");
const ex = exportRows(rows, "2026-10");
ok("화면이 세는 줄 그대로 — 열 「월 · 학생 · 반 · 금액 · 받은 날 · 상태」 · 강민서 받음 · 서예린 빈 금액", Object.keys(ex[0]).join() === "월,학생,반,금액,받은 날,상태" && ex[0].상태 === "받음" && ex[0].금액 === 360000 && ex[3].금액 === "" && ex[3].상태 === "금액 없음", J(ex));
console.log("■ 학년별 기준 양식 · 수납 방법 · 지난달 안 받음(4단계-4)");
ok("학년 열쇠 12 — 초1 … 고3 · 옛 설정 tuition.byGrade 의 열쇠와 같은 글(gradeKey 가 만드는 것)", GRADE_KEYS.length === 12 && GRADE_KEYS[0] === "초1" && GRADE_KEYS[11] === "고3" && GRADE_KEYS.includes(gradeKey("middle", 2)) && GRADE_KEYS.includes(gradeKey("elem", 6)));
ok("양식 읽기 — 「250,000」 → 250000 · 「380000원」 → 380000 · 빈 칸은 안 적음(지우는 게 아니라 안 건드림) · 0·「abc」는 막음", J(parseByGrade({ "초1": "250,000", "중3": "380000원", "고1": "" })) === J({ "초1": 250000, "중3": 380000 }) && J(parseByGrade({})) === "{}" && [() => parseByGrade({ "초1": "0" }), () => parseByGrade({ "고3": "abc" })].every((f) => { try { f(); return false; } catch { return true; } }), J(parseByGrade({ "초1": "250,000", "중3": "380000원", "고1": "" })));
ok("수납 방법 넷 — 계좌 · 카드 · 현금 · 기타(결제선생 엑셀이 적는 말과 같다)", METHODS.join() === "계좌,카드,현금,기타");
ok("지난달 안 받음 알약 — 1명 200,000 → 「지난달 안 받음 1명 · 200,000원」 · 0명이면 빈 글(알약 안 뜸) · 없으면 빈 글", prevUnpaidText({ n: 1, sum: 200000 }) === "지난달 안 받음 1명 · 200,000원" && prevUnpaidText({ n: 0, sum: 0 }) === "" && prevUnpaidText(null) === "", prevUnpaidText({ n: 1, sum: 200000 }));
ok("입금 확인 한 번에((가)-⑩ 도장) — 「안 받음」 줄만(금액은 줄에 선 것 · 받은 날 = 그날 · 수납 방법 칸은 안 보내 안 건드린다) · 받음·금액 없음 줄은 빠진다 · 없으면 빈 목록", J(payAllEdits([{ student_id: "a", amount: 300000, state: "paid", paid_on: "2026-09-01", method: "계좌" }, { student_id: "b", amount: 200000, state: "unpaid", paid_on: null, method: "카드" }, { student_id: "c", amount: null, state: "none" }], "2026-09-08")) === J([{ student_id: "b", amount: 200000, paid_on: "2026-09-08" }]) && payAllEdits([], "2026-09-08").length === 0 && payAllEdits([{ student_id: "a", amount: 1, state: "paid" }], "2026-09-08").length === 0, J(payAllEdits([{ student_id: "b", amount: 200000, state: "unpaid", method: "카드" }], "2026-09-08")));
console.log(`\n■ 수강료 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
