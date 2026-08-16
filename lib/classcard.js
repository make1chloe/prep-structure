// 클래스카드 판정 — **한 곳** (docs/클래스카드-연동-설계.md).
//
// 확장이 보내온 것(classcard_day·classcard_planner)을 화면이 읽을 때
// 쓰는 셈들. 화면마다 따로 세면 오늘 수업과 대시보드가 다른 말을 한다.

/**
 * 앱 학생 ↔ 클카 학생 잇기.
 * 규칙: 재원생 정보의 「클카 아이디」(classcard_login — 학교에서 이미
 * 계정을 만든 아이들)가 있으면 그것, 없으면 앱 아이디(login_id).
 */
export function ccLoginOf(student) {
  return (student?.classcard_login || student?.login_id || "").trim().toLowerCase();
}

/** roster(classcard_students 줄들)에서 이 학생의 user_idx 를 찾는다 */
export function ccUserIdxOf(student, roster = []) {
  const login = ccLoginOf(student);
  if (!login) return null;
  const hit = roster.find((r) => (r.login_id || "").trim().toLowerCase() === login);
  return hit?.user_idx || null;
}

/** 그날 마감 세트 요약 — 오늘 수업 태그가 그린다 */
export function ccDaySummary(sets = []) {
  const total = sets.length;
  const done = sets.filter((s) => s.complete).length;
  return { total, done, allDone: total > 0 && done === total };
}

/**
 * 플래너 소진 판정 (감시② — 원장님 「꼭 필요」).
 * 이번 달+다음 달 마감일 중 오늘 이후가 없거나, 마지막이 3일 안이면
 * 「새로 잡아야 함」.
 */
export function plannerRunningOut(days = [], today) {
  const future = [...new Set(days)].filter((d) => d >= today).sort();
  if (future.length === 0) return { out: true, last: null };
  const last = future[future.length - 1];
  const soon = new Date(last) - new Date(today) <= 3 * 86400000;
  return { out: soon, last };
}
