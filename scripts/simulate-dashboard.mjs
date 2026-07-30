// 대시보드 시뮬레이션 — "하루를 시작하는 화면이 그날 일을 다 보여주는가"
//
// 기존 시뮬 4종은 오늘 수업·수강료·경고를 본다. 이건 그 앞 단계다.
//   아침에 대시보드를 열었을 때
//   · 그날 반드시 알아야 하는 일이 다 떠 있는가        (T1 신호 커버리지)
//   · 뜬 것을 눌러서 바로 처리하러 갈 수 있는가        (T2 조작 거리)
//   · 같은 정보가 두 번 뜨거나 두 화면에 흩어졌는가    (T3 중복)
//   · 화면이 뜨는 데 얼마나 걸리는가                  (T4 직렬 쿼리)
//
// 판정 로직은 실제 라이브러리를 그대로 쓴다 (warnings · tuition · monthly · wordTest).
// "현재 대시보드가 무엇을 띄우는가"는 app/page.jsx 의 선택 규칙을 그대로 옮겨 적었다.
//   → 규칙이 바뀌면 아래 CURRENT_RULES 도 같이 고쳐야 한다. (T2·T4는 파일을 직접 읽으므로 자동)

import fs from "node:fs";
import { tally, DEFAULT_RULE } from "../lib/warnings.js";
import { classSessions, studentAmount } from "../lib/tuition.js";
import { summarize } from "../lib/monthly.js";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dowOf = (d) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const addDays = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

// ── 오늘: 월말 이틀 전 화요일. 시험은 다음 주 ─────────────────────────
const TODAY = "2026-09-29";                    // 화
const WEEK_END = addDays(TODAY, 7);            // 10-06
const MONTH_AGO = addDays(TODAY, -30);

// ── 반 · 학생 ────────────────────────────────────────────────────────
const CLASSES = [
  { id: "c1", name: "월수1", days: ["월", "수"], base_sessions: 8, tuition: 320000 },
  { id: "c2", name: "화목1", days: ["화", "목"], base_sessions: 8, tuition: 320000 },
];
const STUDENTS = [
  { id: "s1", name: "김서은", cls: "c1", school: "신정중", grade: "중2" },
  { id: "s2", name: "박윤찬", cls: "c1", school: "신정중", grade: "중2" },
  { id: "s3", name: "구도은", cls: "c1", school: "신송중", grade: "중3" },
  { id: "s4", name: "왕희연", cls: "c2", school: "신송중", grade: "중3" },
  { id: "s5", name: "노주하", cls: "c2", school: "신정중", grade: "중2" },
  { id: "s6", name: "서지안", cls: "c2", school: "신정중", grade: "중2" },
  { id: "s7", name: "홍채은", cls: "c1", school: "신송중", grade: "중1" },
  { id: "s8", name: "윤서영", cls: "c2", school: "신정중", grade: "중2" },
  { id: "s9", name: "김소현", cls: "c2", school: "신송중", grade: "중3" },
  { id: "s10", name: "문가은", cls: "c2", school: "신송중", grade: "중3" },
];
const nameOf = new Map(STUDENTS.map((s) => [s.id, s.name]));

// ── 한 달치 기록 (사건을 심어둔다) ───────────────────────────────────
// s1 — 경고 3회 (지각 · 미제출 · 단어 미통과). 정산한 적 없음 → 반성문 문턱
const REPORTS = [
  { student_id: "s1", date: "2026-09-08", attendance_kind: "late", word_correct: 19, word_total: 20, items: [{ status: "done" }] },
  { student_id: "s1", date: "2026-09-15", attendance_kind: "present", word_correct: 20, word_total: 20, items: [{ status: "missing" }] },
  { student_id: "s1", date: "2026-09-22", attendance_kind: "present", word_correct: 12, word_total: 20, items: [{ status: "done" }] },
  // s2 — 경고 2회 (아직 문턱 아님)
  { student_id: "s2", date: "2026-09-15", attendance_kind: "late", word_correct: 20, word_total: 20, items: [] },
  { student_id: "s2", date: "2026-09-22", attendance_kind: "present", word_correct: 20, word_total: 20, items: [{ status: "weak" }] },
  // s7 — 최근 2주 미제출·미흡 3건 (watchList 감지용)
  { student_id: "s7", date: "2026-09-17", attendance_kind: "present", word_correct: 18, word_total: 20, items: [{ status: "missing" }] },
  { student_id: "s7", date: "2026-09-22", attendance_kind: "present", word_correct: 18, word_total: 20, items: [{ status: "weak" }] },
  { student_id: "s7", date: "2026-09-24", attendance_kind: "present", word_correct: 18, word_total: 20, items: [{ status: "missing" }] },
  // s5 — 어제 리포트 작성 완료. 발송 실패 (아래 SEND_LOGS)
  { student_id: "s5", date: "2026-09-28", attendance_kind: "present", word_correct: 20, word_total: 20, items: [{ status: "done" }], report_written: true, sent_at: null },
];

// 출결 — s3 무단결석(보강 안 잡힘) · s4 결석(보강 완료) · s6 오늘 재시험 · s2 다음 주 결석 예정
const ATTENDANCE = [
  { student_id: "s3", date: "2026-09-22", status: "absent", planned: false, reason: "" },
  { student_id: "s4", date: "2026-09-08", status: "absent", planned: true, reason: "가족 여행" },
  { student_id: "s4", date: "2026-09-12", status: "makeup", makeup_of: "2026-09-08" },
  { student_id: "s6", date: TODAY, status: "makeup", makeup_of: null, reason: "단어 재시험" },
  { student_id: "s2", date: "2026-10-02", status: "absent", planned: true, reason: "가족 행사" },
];

// 발송 이력 — 어제 s5 리포트가 실패로 남아 있다 (/resend 감)
const SEND_LOGS = [
  { student_id: "s5", date: "2026-09-28", kind: "report", status: "fail", error: "수신번호 오류" },
];

// 시험 — 신정중 중2, 다음 주 (시험범위는 아직 미등록)
const EXAMS = [
  { school: "신정중", grade: "중2", name: "2학기 중간", from_date: "2026-10-06", to_date: "2026-10-08", english_on: "2026-10-07", scope_registered: false },
];

// 휴강 — 9/17(목) 반 휴강 → c2 학생들 보강 필요
const HOLIDAYS = [{ date: "2026-09-17", scope: "all", name: "원장 개인 사정" }];

// 학생·학부모 요청과 댓글
const REQUESTS = [{ student_id: "s10", kind: "absent", from_date: "2026-10-05", to_date: "2026-10-05", status: "new" }];
const COMMENTS = [{ student_id: "s7", author_role: "parent", body: "단어 숙제 방법을 잘 모르겠다고 합니다", read_at: null }];
const INQUIRIES = [{ name: "이準호", school: "신정중", grade: "중1", status: "new", form_submitted_at: null }];

// 수납 — 9월분 미납 2건 (앱에는 이 개념 자체가 없다)
const UNPAID = [
  { student_id: "s3", ym: "2026-09", amount: 320000 },
  { student_id: "s8", ym: "2026-09", amount: 320000 },
];

// ═════════════════════════════════════════════════════════════════════
// 1) 그날 원장님이 알아야 하는 것 (정답지) — 실제 라이브러리로 계산
// ═════════════════════════════════════════════════════════════════════
const NEEDED = [];

// 반성문 문턱 — lib/warnings.tally
for (const s of STUDENTS) {
  const mine = REPORTS.filter((r) => r.student_id === s.id).sort((a, b) => a.date.localeCompare(b.date));
  const st = tally(mine, [], DEFAULT_RULE);
  if (st.need) NEEDED.push({ key: "warning", sev: "높음", text: `${s.name} 경고 ${st.count}회 — 반성문 문턱. 오늘 이야기해야 한다` });
}

// 보강 안 잡힌 결석 — page.jsx 와 같은 규칙 (30일 내 결석 중 makeup_of 없는 것)
const doneMakeup = new Set(ATTENDANCE.filter((a) => a.status === "makeup" && a.makeup_of).map((a) => `${a.student_id}|${a.makeup_of}`));
const openAbsent = ATTENDANCE.filter(
  (a) => a.status === "absent" && a.date >= MONTH_AGO && a.date <= WEEK_END && !doneMakeup.has(`${a.student_id}|${a.date}`)
);
openAbsent.forEach((a) =>
  NEEDED.push({ key: "makeup", sev: "높음", text: `${nameOf.get(a.student_id)} ${a.date.slice(5)} 결석 — 보강 안 잡힘` })
);

// 발송 실패 · 어제 미발송
SEND_LOGS.filter((l) => l.status === "fail").forEach((l) =>
  NEEDED.push({ key: "sendfail", sev: "높음", text: `${nameOf.get(l.student_id)} 리포트 발송 실패(${l.error}) — 재발송 필요` })
);
REPORTS.filter((r) => r.report_written && !r.sent_at && r.date < TODAY).forEach((r) =>
  NEEDED.push({ key: "unsent-past", sev: "높음", text: `${nameOf.get(r.student_id)} ${r.date.slice(5)} 리포트 써놓고 안 나감` })
);

// 오늘 재시험
ATTENDANCE.filter((a) => a.date === TODAY && a.status === "makeup" && (a.reason || "").includes("재시험")).forEach((a) =>
  NEEDED.push({ key: "retest", sev: "중간", text: `${nameOf.get(a.student_id)} 오늘 ${a.reason}` })
);

// 시험 임박 + 범위 미등록 — 전날이 아니라 **일주일 전에** 알아야 대비를 시작한다
EXAMS.filter((e) => e.from_date > TODAY && e.from_date <= WEEK_END).forEach((e) => {
  NEEDED.push({ key: "exam-soon", sev: "높음", text: `${e.school} ${e.grade} 시험 ${e.from_date.slice(5)}~ — 내신 전환 시점` });
  if (!e.scope_registered) NEEDED.push({ key: "exam-scope", sev: "높음", text: `${e.school} ${e.grade} 시험범위 미등록 — /prep 에서 정해야 숙제를 바꾼다` });
});

// 월말 — lib/monthly.summarize 가 있는데 쓸 시점을 아무도 안 알려준다
const monthEnd = "2026-09-30";
if (addDays(TODAY, 2) >= monthEnd) {
  const withReports = new Set(REPORTS.map((r) => r.student_id));
  NEEDED.push({ key: "monthly", sev: "중간", text: `9월이 ${monthEnd.slice(8)}일에 끝남 — 월말 리포트 ${withReports.size}명분 준비 시점` });
}

// 보강 필요 횟수 — lib/tuition (휴강 1회 → c2 전원)
for (const k of CLASSES) {
  const ses = classSessions("2026-09", k, HOLIDAYS, ["금"]);
  const roster = STUDENTS.filter((s) => s.cls === k.id);
  for (const s of roster) {
    const r = studentAmount(ses.live, k.base_sessions, k.tuition, {}, ses.all);
    if (r.makeupNeeded > 0) {
      NEEDED.push({ key: "tuition-makeup", sev: "중간", text: `${k.name} ${s.name} 보강 필요 ${r.makeupNeeded}회 (차액 ${r.credit}원)`, fold: k.id });
    }
  }
}

// 새 요청 · 댓글 · 상담
REQUESTS.filter((r) => r.status === "new").forEach((r) =>
  NEEDED.push({ key: "request", sev: "중간", text: `${nameOf.get(r.student_id)} 결석 요청 ${r.from_date.slice(5)}` })
);
COMMENTS.filter((c) => !c.read_at).forEach((c) =>
  NEEDED.push({ key: "comment", sev: "중간", text: `${nameOf.get(c.student_id)} 학부모 댓글` })
);
INQUIRIES.filter((q) => ["new", "scheduled"].includes(q.status)).forEach((q) =>
  NEEDED.push({ key: "inquiry", sev: "중간", text: `신규 상담 ${q.name}` })
);

// 미납 — 기능 자체가 없다
UNPAID.forEach((u) =>
  NEEDED.push({ key: "unpaid", sev: "높음", text: `${nameOf.get(u.student_id)} 9월분 미납 ${u.amount.toLocaleString()}원` })
);

// 요약 숫자 — 학원이 지금 어떤 상태인가
NEEDED.push({ key: "kpi", sev: "중간", text: `요약 숫자: 재원 ${STUDENTS.length}명 · 이달 출석률 · 리포트 발송률` });

// ═════════════════════════════════════════════════════════════════════
// 2) 현재 대시보드가 띄우는 것 — app/page.jsx 의 선택 규칙 그대로
// ═════════════════════════════════════════════════════════════════════
const CURRENT_RULES = {
  // key → 띄우는가(데이터 함수), 어떻게(link | dead | none)
  warning: { shows: () => false, how: "none" },                       // 경고·반성문 계산은 /today 문자 문구에만 쓴다
  makeup: { shows: () => openAbsent.length > 0, how: "card" },        // MakeupInbox 카드 (배지는 span)
  sendfail: { shows: () => false, how: "none" },                      // 발송 실패는 /resend 만 안다
  "unsent-past": { shows: () => false, how: "none" },                 // unsent 쿼리가 eq(date, TODAY) — 어제 것은 영영 안 보인다
  retest: { shows: () => false, how: "none" },                        // 오늘 재시험 집계 없음
  "exam-soon": { shows: () => true, how: "dead" },                    // engEves — 시험 '전날 등원' 태그로만, 링크 없음
  "exam-scope": { shows: () => false, how: "none" },                  // 범위 미등록 신호 없음
  monthly: { shows: () => false, how: "none" },                       // 월말 시점 알림 없음
  "tuition-makeup": { shows: () => false, how: "none" },              // /tuition 에만 있다
  request: { shows: () => REQUESTS.some((r) => r.status === "new"), how: "card" },   // RequestInbox — 그 자리에서 확인 처리
  comment: { shows: () => COMMENTS.some((c) => !c.read_at), how: "link" },           // 댓글 → '오늘 수업에서 답하기' 링크
  inquiry: { shows: () => INQUIRIES.length > 0, how: "link" },        // 새 상담 → /consult 링크
  unpaid: { shows: () => false, how: "none" },                        // 수납 기능 없음 (테이블도 없음)
  kpi: { shows: () => false, how: "none" },                           // 요약 숫자 없음
};

// ═════════════════════════════════════════════════════════════════════
// 3) 대조
// ═════════════════════════════════════════════════════════════════════
console.log("=".repeat(72));
console.log(`  대시보드 시뮬레이션 — ${TODAY} (${dowOf(TODAY)}) 아침, 원장님이 화면을 연다`);
console.log("=".repeat(72));

console.log(`\n─ 오늘 알아야 하는 것 ${NEEDED.length}건 ─`);
const seenFold = new Set();
for (const n of NEEDED) {
  if (n.fold && seenFold.has(n.fold)) continue;   // 같은 반 반복은 첫 줄만
  if (n.fold) seenFold.add(n.fold);
  const rule = CURRENT_RULES[n.key];
  const shown = rule && rule.shows();
  const mark = shown ? (rule.how === "dead" ? "▲ 뜨지만 막다름" : "○ 뜸") : "✕ 안 뜸";
  console.log(`  [${n.sev}] ${mark}  ${n.text}${n.fold ? " …외 같은 반 전원" : ""}`);
}

const missed = NEEDED.filter((n) => !CURRENT_RULES[n.key]?.shows());
const dead = NEEDED.filter((n) => CURRENT_RULES[n.key]?.shows() && CURRENT_RULES[n.key].how === "dead");
const uniqMissedKeys = [...new Set(missed.map((n) => n.key))];

// ── T2 · T4: page.jsx 를 직접 읽어 잰다 (코드가 바뀌면 여기 결과도 바뀐다) ──
const page = fs.readFileSync(new URL("../app/page.jsx", import.meta.url), "utf8");
const awaits = (page.match(/await supabase/g) || []).length;
const promiseAll = (page.match(/Promise\.all/g) || []).length;
const deadSpans = (page.match(/<span className="btn"/g) || []).length;   // 배지처럼 생겼는데 못 누르는 것

console.log(`\n─ T2 조작 거리 (app/page.jsx 실측) ─`);
console.log(`  배지 모양인데 못 누르는 <span className="btn">: ${deadSpans}개 (학부모 알림 · 보강 잡을 것)`);
console.log(`  특이사항 카드의 태그(결석 예정·미흡 학생 등)도 전부 링크 없음`);

console.log(`\n─ T3 중복 ─`);
console.log(`  · '보강 잡을 것' — 상단 배지(span) + MakeupInbox 카드, 같은 화면에 두 번`);
console.log(`  · '학부모 알림' — 상단 배지(span) + RequestInbox 카드, 같은 화면에 두 번`);
console.log(`  · 스케줄 특이사항 — 상단 배지 + 특이사항 카드 안, 같은 화면에 두 번`);
console.log(`  · tasks 한 테이블 → /todo 와 /tasks 두 화면 (kind 로만 갈라짐)`);
console.log(`  · 일정이 네 곳: tasks · exam_periods · holidays · attendance.planned (문서에도 적힌 미결정)`);

console.log(`\n─ T4 성능 (app/page.jsx 실측) ─`);
console.log(`  await supabase 호출: ${awaits}회 · Promise.all: ${promiseAll}회 → 전부 직렬`);
console.log(`  쿼리당 40ms 로 치면 첫 화면 약 ${((awaits * 40) / 1000).toFixed(1)}초. 병렬로 묶으면 ~0.2초`);

console.log("\n" + "=".repeat(72));
console.log(`  결과: ${NEEDED.length}건 중 안 뜨는 것 ${missed.length}건 (${uniqMissedKeys.length}종) · 뜨지만 막다른 것 ${dead.length}건`);
console.log("=".repeat(72));
for (const k of uniqMissedKeys) {
  const first = missed.find((n) => n.key === k);
  console.log(`  ✕ ${k.padEnd(14)} ${first.text}`);
}
