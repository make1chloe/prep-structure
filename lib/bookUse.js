// 이 교재를 **오늘 쓰고 있나.**
//
// 배정에는 날짜가 둘 있다.
//   assigned_on  이 날부터 쓴다   (교재 안내를 보낼 때 「사용 예정일」로 적는다)
//   ended_on     이 날까지 썼다
//
// 교재 안내는 **아직 안 산 책**을 사달라고 보내는 문자다. 보내는 순간 재원생
// 정보에 꽂아버리면, 아직 책이 없는데 오늘 수업 진도·숙제 범위에 그 교재가
// 뜬다. 그래서 배정은 지금 해두되 **쓰기 시작하는 날부터** 보이게 한다.
//
// 규칙을 여기 한 곳에만 둔다. 화면마다 따로 걸러 놓으면 오늘 수업에서는
// 안 보이는데 수업준비에서는 보이는 일이 생긴다.

/**
 * @param row  student_textbooks 한 줄 { status, assigned_on, ended_on }
 * @param date "YYYY-MM-DD" — 그날 기준으로 본다 (지난 수업을 고칠 때도 맞아야 한다)
 */
export function inUseOn(row, date) {
  if (!row) return false;
  if (row.status && row.status !== "active") return false;   // 끝냈거나 그만둔 것
  if (date) {
    if (row.assigned_on && row.assigned_on > date) return false;   // 아직 시작 전
    if (row.ended_on && row.ended_on < date) return false;         // 이미 끝난 것
  }
  return true;
}

/** 아직 시작 안 한 것인가 — 재원생 정보에 「9월 1일부터」 로 적어주려고 쓴다 */
export function notYet(row, date) {
  if (!row || !date) return false;
  if (row.status && row.status !== "active") return false;
  return !!(row.assigned_on && row.assigned_on > date);
}

/** 「9월 1일부터」 */
export function fromLabel(assignedOn) {
  if (!assignedOn) return "";
  const [, m, d] = String(assignedOn).split("-");
  if (!m || !d) return "";
  return `${Number(m)}월 ${Number(d)}일부터`;
}
