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
  "/parent",    // 학부모 화면 — 자기 아이 것만 보인다 (RLS 가 한 번 더 막는다)
  "/logout",
  "/auth",      // 로그인 처리
  "/login",
  "/apply",     // 로그인 없이 여는 신청 양식
  "/push",      // 알림 켜기
  // 지금 돌고 있는 앱이 몇 번째 것인가 — 홈 화면 앱이 새 배포를 알아채는 데 쓴다.
  // **학생·학부모가 제일 필요하다** (그분들이 홈 화면에 담아 쓰신다).
  // 여기 안 열어두면 물어보러 갔다가 /me 로 되돌려져서, 새 버전이 나와도
  // 「새 버전이 나왔어요」 가 영영 안 뜬다.
  "/api/version",
  "/manifest",  // 앱으로 설치할 때
  "/icons",
  "/install",   // 앱 담기 안내 — 로그인 전에도 열려야 담을 수 있다
];

export function canOpen(role, path) {
  if (isStaff(role)) return true;
  return OPEN_TO_ALL.some((p) => path === p || path.startsWith(`${p}/`));
}

/** 그 사람이 가야 할 첫 화면 */
export function homeFor(role) {
  if (isStaff(role)) return "/";
  // 학부모와 학생은 보는 것이 다르다 — 학생 화면에는 "시작하기" 가 있고,
  // 학부모 화면에는 이번 달이 어떻게 되고 있는지가 있다
  return role === "parent" ? "/parent" : "/me";
}
