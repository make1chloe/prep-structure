/** 신규 상담 판단 검사(검사-61) — lib/inquiry-plan.js 순수 셈: 칸 다섯 · 답 안 한 것은 hot · 「N시간째 답 안 함」 · 「어제 21:14」 · 방문 「9/3 수 16:00」 · 레벨 같은 날 · 연락 가림 · 왜 글(단계마다) · 양식 읽기 · 전환 양식 · 학교 맞추기 · 일곱 */
import { columnsOf, unansweredText, agoText, whenText, maskPhone, parseInquiry, parseConvert, matchSchool, SEVEN, STAGES } from "../lib/inquiry-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const J = (x) => JSON.stringify(x);
const thr = (fn) => { try { fn(); return false; } catch { return true; } };
const T = "2026-09-04", NOW = "2026-09-04T09:14:00+09:00";
const qs = [
  { id: 1, name: "박서준", phone: "01012341234", school: "신정중", grade: 2, way: "site", stage: "new", body: "주 2회 · 수업료", created_at: "2026-09-03T21:14:00+09:00", answered_at: null },
  { id: 2, name: "이하늘", phone: "01000000000", school: "연수중", grade: 3, way: "phone", stage: "visit", visit_at: "2026-09-03T16:00:00+09:00", test_at: "2026-09-03T16:00:00+09:00", created_at: "2026-09-01T10:00:00+09:00" },
  { id: 3, name: "최윤아", phone: "01000000001", school: "옥련여고", grade: 1, way: "phone", stage: "visit", visit_at: "2026-09-05T15:00:00+09:00", test_at: null, created_at: "2026-09-01T10:00:00+09:00" },
  { id: 4, name: "정민재", phone: "01000000002", school: "신송중", grade: 2, stage: "test", level_note: "단어 32/40", suggest: null, created_at: "2026-08-30T10:00:00+09:00" },
  { id: 5, name: "조은채", phone: "01000000003", stage: "joined", student_id: "s", student: "조은채", created_at: "2026-09-01T10:00:00+09:00" },
  { id: 6, name: "김도윤", phone: "01000000004", stage: "dropped", why: "다른 학원", created_at: "2026-08-22T10:00:00+09:00" },
  { id: 7, name: "답한 문의", phone: "01000000005", stage: "new", created_at: "2026-09-02T10:00:00+09:00", answered_at: "2026-09-03T10:00:00+09:00" }];
console.log("■ 칸 다섯 · 카드 글");
const c = columnsOf(qs, T, NOW);
ok("칸 다섯(new 2 · visit 2 · test 1 · joined 1 · dropped 1) · 답 안 한 것 1(답한 문의는 hot 아님) · 첫 칸이 urgent", c.columns.map((x) => x.cards.length).join() === "2,2,1,1,1" && c.unanswered === 1 && c.columns[0].urgent === true && STAGES.length === 5, J(c.columns.map((x) => x.cards.length)));
const first = c.columns[0].cards[0];
ok("박서준 — hot · 「어제 21:14 · 홈페이지 설문」 · 학년 「2학년 · 신정중」 · 연락 「010-****-1234」 · 왜 「12시간째 답 안 함」", first.hot === true && first.when === "어제 21:14" && first.wayText === "홈페이지 설문" && first.sub === "2학년 · 신정중" && first.phoneText === "010-****-1234" && first.why === "12시간째 답 안 함", J([first.when, first.sub, first.phoneText, first.why]));
const v = c.columns[1].cards;
ok("상담 잡힘 — 이하늘 방문 「9/3 목 16:00」 · 레벨 「9/3 목 16:00 같은 날」 · 왜 「일정이 원장 달력에…」 / 최윤아 레벨 「안 잡힘」 · 왜 「레벨테스트를 아직 안 잡았습니다」", v[0].visitText === "9/3 목 16:00" && v[0].testText === "9/3 목 16:00 같은 날" && v[0].why === "일정이 원장 달력에 떠 있습니다" && v[1].testText === "안 잡힘" && v[1].why === "레벨테스트를 아직 안 잡았습니다", J(v.map((x) => [x.visitText, x.testText, x.why])));
ok("레벨 봄 — 제안이 없으면 「제안 교재를 적어 두세요」 · 등록 「일곱이 저절로」 · 안 옴 사유 그대로 · 답한 문의 「안내 보냄 어제 10:00」", c.columns[2].cards[0].why === "제안 교재를 적어 두세요" && c.columns[3].cards[0].why === "등록 전환에서 일곱이 저절로 됐습니다" && c.columns[4].cards[0].why === "다른 학원" && c.columns[0].cards[1].why === "안내 보냄 어제 10:00");
console.log("■ 글 셈 · 양식");
ok("「방금 들어옴」 · 「3시간째」 · 「2일째」 · 「오늘 09:10」 · 「8/22」 · 가림(짧으면 ****) · 빈 것", unansweredText("2026-09-04T09:00:00+09:00", NOW) === "방금 들어옴 — 답 안 함" && unansweredText("2026-09-04T06:00:00+09:00", NOW) === "3시간째 답 안 함" && unansweredText("2026-09-02T06:00:00+09:00", NOW) === "2일째 답 안 함" && agoText("2026-09-04T09:10:00+09:00", T) === "오늘 09:10" && agoText("2026-08-22T09:10:00+09:00", T) === "8/22" && maskPhone("0101") === "****" && maskPhone("") === "" && whenText(null) === "");
ok("문의 양식 — 전화 숫자만 · 학년 · 갈래 기본 전화 · 이름·전화 없으면 막음", J(parseInquiry({ name: " 박서준 ", phone: "010-1234-1234", school: "신정중", grade: "2", way: "site", body: " 주 2회 " })) === J({ name: "박서준", phone: "01012341234", student_phone: null, school: "신정중", grade: 2, way: "site", body: "주 2회" }) && parseInquiry({ name: "x", phone: "01012341234", way: "zz" }).way === "phone" && thr(() => parseInquiry({ name: "", phone: "01012341234" })) && thr(() => parseInquiry({ name: "x", phone: "1234" })));
ok("전환 양식 — 반 필수 · 교재 겹침 하나로 · 아이디 소문자 · 날짜 꼴 · 일곱", J(parseConvert({ classId: "c1", bookIds: ["b1", "b1", "b2"], loginId: " Chloe0515 ", joinedOn: "2026-09-04" })) === J({ classId: "c1", bookIds: ["b1", "b2"], loginId: "chloe0515", joinedOn: "2026-09-04" }) && thr(() => parseConvert({ classId: "", loginId: "abc" })) && thr(() => parseConvert({ classId: "c1", loginId: "한글" })) && thr(() => parseConvert({ classId: "c1", loginId: "zznew01" })) && parseConvert({ classId: "c1", loginId: "0515" }).loginId === "chloe0515" && SEVEN.length === 7 && SEVEN.map(([k]) => k).join() === "student,accounts,class,books,routine,fee,welcome");
ok("학교 맞추기 — 「신정중」 → 신정중학교(앞이 같으면) · 정확히 같은 것이 먼저 · 없으면 null", matchSchool("신정중", [{ id: 1, name: "신정중학교" }, { id: 2, name: "신정초등학교" }]).id === 1 && matchSchool("신정초등학교", [{ id: 1, name: "신정중학교" }, { id: 2, name: "신정초등학교" }]).id === 2 && matchSchool("없는학교", [{ id: 1, name: "신정중학교" }]) === null && matchSchool("", []) === null);
console.log(`\ncheck-inquiry ${bad ? "✗" : "✓"} ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
