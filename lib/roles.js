// 누가 어디를 볼 수 있나
//
// 지금까지 로그인만 하면 모든 화면이 열렸다. 데이터 자체는 DB 가 막고
// 있었지만(RLS), **화면은 열렸다.** 학생이 주소만 치면 오늘 수업도,
// 재원생 목록도, 수강료도 화면이 떴다.
//
// 막는 곳은 **한 군데여야 한다.** 페이지마다 "너 선생님이야?" 를 적으면
// 언젠가 하나를 빠뜨리고, 빠뜨린 그 하나가 사고가 된다.
// 그래서 미들웨어에서 한 번만 막는다 — 새 페이지를 만들어도 자동으로 막힌다.

export const STAFF_ROLES = ["principal", "instructor", "assistant"];

export function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

/**
 * 학생·학부모가 열어도 되는 곳.
 *
 * 여기 없는 것은 전부 막힌다 (막는 쪽이 기본이다).
 */
const OPEN_TO_ALL = [
  "/me",        // 학생 화면
  "/logout",
  "/auth",      // 로그인 처리
  "/login",
  "/apply",     // 로그인 없이 여는 신청 양식
  "/push",      // 알림 켜기
  "/manifest",  // 앱으로 설치할 때
  "/icons",
];

export function canOpen(role, path) {
  if (isStaff(role)) return true;
  return OPEN_TO_ALL.some((p) => path === p || path.startsWith(`${p}/`));
}

/** 그 사람이 가야 할 첫 화면 */
export function homeFor(role) {
  return isStaff(role) ? "/" : "/me";
}
