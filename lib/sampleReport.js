/**
 * 시험 삼아 보내볼 때 쓰는 **가짜 수업 기록** — 네트워크도 DB도 안 탄다.
 *
 * 테스트용 학생은 수업 기록이 없다. 그런데 문자 본문은 수업 기록에서 나온다.
 * 기록이 없으면 "출결도 숙제도 없는 빈 문자" 가 나가고, 그러면 정작 확인하려던
 * **줄바꿈 · 이모지 · 길이 · 인삿말** 을 하나도 못 본다.
 *
 * 그래서 실제와 같은 모양의 한 판을 만들어 둔다. 진짜 기록이 있으면 그걸 쓰고,
 * 없을 때만 이걸 쓴다.
 */
export function sampleRow(name = "테스트") {
  return {
    student: { name, school: "테스트중학교", grade: "2학년" },
    report: {
      attendance_kind: "present",
      attitude: "Excellent",
      word_correct: 18,
      word_total: 20,
      sent_correct: 9,
      sent_total: 10,
      own_progress: "구문독해 Unit 5까지",
      notice: "다음 주는 학교 시험 기간이라 보강 일정을 따로 안내드리겠습니다.",
      late_until: "21:30",
      late_reason: "단어시험 재시험",
    },
    checks: [
      { name: "단어 클래스카드 필수학습", status: "done", note: "" },
      { name: "문법 문제풀기", status: "weak", note: "관계대명사 부분을 다시 봐야 합니다" },
      { name: "독해 지문 예습", status: "missing", note: "" },
    ],
    next: [
      { name: "셀프녹음테스트 (문답노트)", units: ["Unit 5"], note: "3회 녹음" },
      { name: "문법 워크북 풀기", units: ["Unit 5"], note: "" },
    ],
    progress: ["문법 Unit 5 · 독해 Unit 3"],
    notices: ["다음 주 월요일은 학교 행사로 6시에 시작합니다."],
    lateUntil: "21:30",
    extraReason: "단어시험 재시험",
  };
}

/** 보내볼 수 있는 것들 — 화면과 서버가 같은 목록을 쓴다 */
export const TEST_KINDS = [
  { key: "report", label: "데일리리포트", who: "학부모" },
  { key: "homework", label: "숙제 문자", who: "학생" },
  { key: "late", label: "하원 안내", who: "학부모" },
  { key: "notice", label: "안내 문자", who: "학부모" },
  { key: "push", label: "앱 알림 (푸시)", who: "학생 · 학부모" },
];
