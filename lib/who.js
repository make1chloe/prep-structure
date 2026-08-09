/**
 * **누가 이 시험을 보는가 · 누가 이 일정에 걸리는가** — 한 곳에서만 답한다.
 *
 * 원장님 (2026-08-09) — 「시험기간이 이상해. 결석예정자도 학사일정과 다르고.
 * 초반에 잘못 잡은 계획이 지금까지 영향을 미쳐서 누더기처럼 수정하는 중이
 * 아닌가 싶은데」
 *
 * ── 무엇이 문제였나 ────────────────────────────────────
 *
 * 설계가 틀린 것이 아니었다. **같은 판단을 여덟 군데에서 제각각** 하고 있었다.
 *
 *   lib/menuBadges     st.school === e.school        ← 성적 미입력
 *   lib/studentCalendar e.school === student.school   ← 아이 달력
 *   app/monthly        p.school === s.school          ← 월간리포트
 *   app/today          s.school === school            ← 오늘 전달사항
 *   app/tasks          s.school === deliver_school    ← 일정 대상
 *   … 그 밖에 셋
 *
 * 그냥 `===` 다. 아이는 「인천신정중학교」, 시험 회차는 나이스가 준 「신정중」.
 * 글자가 다르니 거짓이 되고, **그 아이에게는 시험기간이 안 뜨고 결석예정도
 * 안 잡히고 성적 미입력에도 안 걸린다.** 오류는 안 난다.
 *
 * 더 나쁜 것은 **같게 보는 규칙 자체가 세 벌**이었고 서로 답이 달랐다는 것 —
 *
 *   lib/schoolName.schoolKey     신송중학교 → 신송중   (SQL 과 짝)
 *   lib/taskAudience.schoolKey   신송중학교 → 신송     ← 다른 답
 *   SQL public.school_key()      또 하나
 *
 * 그리고 `sameSchool()` 은 만들어만 두고 **아무 데서도 안 썼다.**
 *
 * ── 왜 다시 짜지 않았나 ────────────────────────────────
 *
 * 표(exam_periods · tasks · attendance)는 멀쩡하다. 다시 짜도 화면 스무 개가
 * 각자 견주면 똑같아진다. 흩어진 판단을 여기 하나로 모으는 것이 값도 싸고
 * 검사로 못 박을 수도 있다 (scripts/check-who.mjs).
 *
 * **여기 말고 다른 데서 학교·학년을 견주지 않는다.**
 */

import { looseKey } from "./schoolName.js";
import { normalizeGrade } from "./grades.js";

/** 전국이 같은 날 보는 것 — 학교를 안 가린다 (모의고사 · 수능) */
export const NATIONWIDE = "전국";

/**
 * **같은 학교인가.**
 *
 * `schoolKey` 가 아니라 `looseKey` 를 쓴다 — 지역 이름까지 봐준다.
 *
 *   내가 적은 것    신정중
 *   나이스가 준 것  인천신정중학교
 *
 * schoolKey 로는 이 둘이 다른 학교다 (SQL 의 school_key 와 짝을 맞추느라
 * 지역을 안 뗀다). 그런데 **아이와 시험을 잇는 자리에서는 그러면 안 된다.**
 * 여기서 못 이으면 아이가 통째로 빠지는데, 잘못 이어봐야 다른 지역 같은
 * 이름의 학교가 섞이는 것뿐이고 그건 한 학원 안에서 사실상 안 일어난다.
 * **못 잇는 쪽이 훨씬 비싸다.**
 *
 * (표에 학교를 새로 만들 때는 여전히 schoolKey 다 — 그건 「한 줄로 묶기」
 *  라서 지역이 다르면 다른 학교로 두는 게 맞다.)
 */
export function sameSchool(a, b) {
  const k = looseKey(a);
  return !!k && k === looseKey(b);
}

/** 같은 학년인가 — 「중2」 · 「중 2」 · 「중학교 2학년」 을 같게 본다 */
export function sameGrade(a, b) {
  const x = normalizeGrade(a || "").trim();
  const y = normalizeGrade(b || "").trim();
  return !!x && x === y;
}

/**
 * **이 아이가 이 시험을 보는가.**
 *
 * 규칙은 셋뿐이다.
 *   · 회차가 「전국」 이면 학교를 안 가린다 (모의고사 · 수능)
 *   · 회차에 학년이 없으면 그 학교 전체가 본다 (나이스의 「1학기 중간고사」 는
 *     학년 구분 없이 한 줄로 온다)
 *   · 아이의 학교·학년이 비어 있으면 **안 본다고 본다** — 모르는 것을 「본다」 로
 *     치면 엉뚱한 아이에게 결석예정이 찍히고, 그건 지우러 다녀야 한다
 */
export function takesExam(student = {}, exam = {}) {
  if (!student.school && exam.school !== NATIONWIDE) return false;
  if (exam.school && exam.school !== NATIONWIDE && !sameSchool(student.school, exam.school)) {
    return false;
  }
  if (exam.grade && !sameGrade(student.grade, exam.grade)) return false;
  return true;
}

/**
 * **이 아이가 이 대상에 드는가** — 일정·공지를 「신정중 2학년」 처럼 좁혀
 * 보낼 때 쓴다. 비운 칸은 안 가린다는 뜻이다.
 */
export function inTarget(student = {}, { school = "", grade = "" } = {}) {
  if (school && !sameSchool(student.school, school)) return false;
  if (grade && !sameGrade(student.grade, grade)) return false;
  return true;
}

/** 그 시험을 보는 아이들만 — 여러 화면이 같은 목록을 봐야 한다 */
export function studentsOfExam(students = [], exam = {}) {
  return students.filter((s) => takesExam(s, exam));
}
