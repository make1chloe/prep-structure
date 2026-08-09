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
 * **조교는 뺀 선생님** — 설정 · 성적 올리기 · 계정 만들기처럼 되돌리기
 * 어려운 일.
 *
 * 이 목록이 일곱 화면에 각자 적혀 있었다 (2026-08-09 전수검사). 그중
 * 둘은 함수 이름이 `requirePrincipal` 인데 강사도 통과시키고 있었다 —
 * 이름이 거짓말을 하면 다음에 그걸 베껴 쓴 자리가 조용히 열린다.
 *
 * 서버 액션에서 확인할 때는 lib/guard 의 requireTeacher 를 쓴다.
 * 여기는 **이미 알고 있는 role 로 화면을 가릴 때**만 쓴다.
 */
export const TEACHER_ROLES = ["principal", "instructor"];

export function isTeacher(role) {
  return TEACHER_ROLES.includes(role);
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
  // 알림이 폰에 닿았는지 서비스워커가 알려오는 자리 (0105).
  // 학생·학부모 폰에서 부르는 것이라 여기 없으면 /me 로 되돌려져서
  // **아무 소리 없이** 안 세어진다
  "/api/push",
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
