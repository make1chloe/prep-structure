/** 성적 판단 검사(검사-55) — lib/score-plan.js 순수 셈: 등급은 회차의 컷으로 세어 나온다(중학교 절대평가 A~E · 학교가 준 등급이 이긴다) · 다음 등급까지 · 컷 글 · 문항표 글 ↔ 줄 · 틀린 번호 글 · 영역 셈 · 그 회차의 줄(없음·기다림·확인됨) · 알약 · 짧은 이름 · 카드 한 줄 · 넣을 회차 · 엑셀 한 줄 · 모의고사 백분위 읽기(0~100 정수 · 빈 것 null) */
import { gradeByCuts, gradeText, toNextGrade, parseCuts, cutsText, cutsFor, parseQuestions, questionsText, parseWrong, wrongSummary, summaryText, rowsOf, counts, examShort, scoreLine, examsForEntry, parseScoreRow, parseSheet, showText, parsePercentile, SHOW, MIDDLE_CUTS } from "../lib/score-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const J = (x) => JSON.stringify(x);
console.log("■ 등급 — 회차의 컷으로 센다");
ok("컷 [90, 84, 77] — 90 → 1 · 84 → 2 · 83.5 → 3 · 76 → 4(그 밑) · 컷 없으면 null · 빈 점수 null", gradeByCuts(90, [90, 84, 77]) === 1 && gradeByCuts(84, [90, 84, 77]) === 2 && gradeByCuts(83.5, [90, 84, 77]) === 3 && gradeByCuts(76, [90, 84, 77]) === 4 && gradeByCuts(88, []) === null && gradeByCuts("", [90]) === null);
ok("중학교는 컷이 비면 절대평가 90·80·70·60 — 88 → B · 91 → A · 59 → E · 고등은 「2등급」", cutsFor({ level: "middle" }).join() === MIDDLE_CUTS.join() && gradeText("middle", gradeByCuts(88, cutsFor({ level: "middle" }))) === "B" && gradeText("middle", 1) === "A" && gradeText("middle", gradeByCuts(59, MIDDLE_CUTS)) === "E" && gradeText("high", 2) === "2등급" && gradeText("high", null) === "");
ok("적힌 컷이 절대평가를 이긴다 · 다음 등급까지 — 88 에 컷 [90,84] 면 1등급까지 2점 · 1등급이면 null", cutsFor({ level: "middle", cuts: [95, 90] }).join() === "95,90" && toNextGrade(88, [90, 84, 77]) === 2 && toNextGrade(92, [90, 84]) === null);
ok("컷 글 — 「90, 84 / 77」 → [90, 84, 77](빈 칸은 버린다 · 높은 순 · 100 넘는 것 버림) · 「A 90 · B 80 …」", J(parseCuts("77, 90 / 84,,")) === J([90, 84, 77]) && J(parseCuts("")) === "[]" && J(parseCuts("120, 90")) === J([90]) && cutsText({ level: "middle" }) === "A 90 · B 80 · C 70 · D 60" && cutsText({ level: "high", cuts: [90, 84] }) === "1등급 90 · 2등급 84");
console.log("■ 문항표 · 틀린 번호 · 영역 셈");
const qs = parseQuestions("1-5 듣기, 6-20 독해, 21 어법, 22~25 서술형");
ok("문항표 글 → 25줄(1-5 듣기 · 6-20 독해 · 21 어법 · 22-25 서술형) → 글로 되돌리면 같다", qs.length === 25 && qs[0].kind === "듣기" && qs[20].kind === "어법" && qs[24].kind === "서술형" && questionsText(qs) === "1-5 듣기, 6-20 독해, 21 어법, 22-25 서술형", questionsText(qs));
ok("틀린 번호 글 — 「3, 7,11 · 3」 → [3, 7, 11](겹침 하나로 · 차례) · 빈 것 []", J(parseWrong("3, 7,11 · 3")) === J([3, 7, 11]) && J(parseWrong("")) === "[]" && J(parseWrong("번호 안 넣음")) === "[]");
ok("영역 셈 — 틀린 [3, 7, 11, 14, 22, 30] → 독해 3 · 듣기 1 · 서술형 1 · 영역 모름 1(문항표 밖) · 많은 것부터", summaryText(wrongSummary([3, 7, 11, 14, 22, 30], qs)) === "독해 3 · 듣기 1 · 서술형 1 · 영역 모름 1", summaryText(wrongSummary([3, 7, 11, 14, 22, 30], qs)));
console.log("■ 그 회차의 줄 · 알약");
const board = { exam: { id: "e1", level: "middle", cuts: null, questions: qs, name: "2학기 중간", english_on: "2026-10-16", school: "신정중학교" },
  takers: [{ id: "a", name: "강민서", grade: 2, score_show: "both" }, { id: "b", name: "구도은", grade: 2, score_show: "student" }, { id: "c", name: "서예린", grade: 2, score_show: "both" }],
  scores: [{ id: "s1", student_id: "a", raw: 88, full_score: 100, grade: null, by_who: "student", confirmed: false, show_to: "student", wrongs: [3, 7, 11], updated_at: "2026-10-17T11:14:00+00:00" },
           { id: "s2", student_id: "b", raw: 76, full_score: 100, grade: 2, by_who: "staff", confirmed: true, show_to: "student", wrongs: [], updated_at: "2026-10-16T02:00:00+00:00" }] };
const rows = rowsOf(board);
ok("강민서 — 아이가 넣음 · 88 → B(세어 나옴) · 틀린 3,7,11 · 기다림 · 공개 「—」 / 구도은 — 학교가 준 등급 2 → B · 번호 안 넣음 · 확인됨 · 학생 ✓ · 학부모 ✕ / 서예린 — 없음", rows.length === 3 && rows[0].state === "pending" && rows[0].byWho === "student" && rows[0].gradeText === "B" && rows[0].wrongText === "3,7,11" && rows[0].summaryText === "독해 2 · 듣기 1" && rows[0].showText === "—" && rows[1].state === "confirmed" && rows[1].gradeN === 2 && rows[1].wrongText === "번호 안 넣음" && rows[1].showText === "학생 ✓ · 학부모 ✕" && rows[2].state === "none" && rows[2].raw === null, J(rows.map((r) => [r.name, r.state, r.gradeText, r.wrongText, r.summaryText])));
ok("알약 — 확인 안 한 것 1 · 안 낸 아이 1 · 확인됨 1 · 공개 글 넷", J(counts(rows)) === J({ unconfirmed: 1, missing: 1, confirmed: 1 }) && SHOW.length === 4 && showText("both") === "학생 ✓ · 학부모 ✓" && showText("parent") === "학생 ✕ · 학부모 ✓" && showText("staff") === "원장만");
console.log("■ 짧은 이름 · 카드 한 줄 · 넣을 회차");
ok("짧은 이름 — 「2학기 중간」 + 10/16 → 「26-2 중간」 · 이름에 26-1 이 있으면 그대로 · 3월 시험은 1학기", examShort(board.exam) === "26-2 중간" && examShort({ name: "26-1 기말", english_on: "2026-07-01" }) === "26-1 기말" && examShort({ name: "1학기 중간", term_from: "2026-04-28" }) === "26-1 중간", examShort(board.exam));
const line = scoreLine({ id: "s1", exam_id: "e1", raw: 88, full_score: 100, confirmed: false, score_wrong: [{ q_no: 3 }, { q_no: 7 }, { q_no: 11 }] }, { ...board.exam, exam_question: qs });
ok("카드 한 줄 — 「26-2 중간 88 · B」 · 작은 글 「확인 기다리는 중 · 독해 2 · 듣기 1 · 신정중학교」(많은 것부터) · 만점이 100 이 아니면 「/50」", line.title === "26-2 중간 88 · B" && line.small === "확인 기다리는 중 · 독해 2 · 듣기 1 · 신정중학교" && line.pending === true && scoreLine({ id: "x", raw: 40, full_score: 50, confirmed: true }, { level: "high", name: "10월 학평", english_on: "2026-10-14" }).title === "26-2 10월 학평 40/50", J(line));
const ex = [{ id: "e1", name: "지난 중간", english_on: "2026-09-20" }, { id: "e2", name: "다음 기말", english_on: "2026-10-20" }, { id: "e3", name: "오래된 것", english_on: "2026-06-01" }, { id: "e4", name: "영어일 없음", term_from: null }];
ok("넣을 회차 — 오늘 10/6: 지난 중간만(다음 기말은 아직 · 6/1 은 60일 지남 · 그날 없음 ✕ · 이미 넣은 것 ✕)", J(examsForEntry(ex, [], "2026-10-06").map((e) => e.id)) === J(["e1"]) && examsForEntry(ex, [{ exam_id: "e1" }], "2026-10-06").length === 0);
console.log("■ 엑셀 한 줄");
const r1 = parseScoreRow({ "학생 이름": "강민서", "원점수": "88점", "만점": "100", "등급": "2", "틀린 문항": "3, 7, 11" });
ok("한 줄 — 이름 · 88 · 100 · 등급 2 · 틀린 [3,7,11] · 이름·점수 없는 줄은 버린다", r1.name === "강민서" && r1.raw === 88 && r1.full === 100 && r1.grade === 2 && J(r1.wrongs) === J([3, 7, 11]) && parseSheet([{ 이름: "구도은", 점수: "76" }, { 이름: "", 점수: "1" }, { 비고: "합계" }]).length === 1, J(r1));
console.log("■ 모의고사 백분위(4단계-4)");
ok("백분위 — 「92」 → 92 · 「 0 」 → 0 · 「100」 → 100 · 빈 것 null · 「101」·「-1」·「9.5」·「높음」은 막음", parsePercentile("92") === 92 && parsePercentile(" 0 ") === 0 && parsePercentile("100") === 100 && parsePercentile("") === null && parsePercentile(undefined) === null && ["101", "-1", "9.5", "높음"].every((v) => { try { parsePercentile(v); return false; } catch { return true; } }));
console.log(`\n■ 성적 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
