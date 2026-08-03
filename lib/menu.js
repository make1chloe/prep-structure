// 화면 목록은 **여기 하나뿐이다.**
// TopBar 와 묶음 페이지가 같은 것을 읽는다 — 두 군데에 적으면 언젠가
// 한쪽만 고치게 된다.

// 묶음은 **하는 일**로 나눈다.
//
// 그때그때 화면을 붙이다 보니 연결성 없는 것들이 한 묶음에 들어가 있었다.
// 「수업」 하나에 오늘수업·숙제검사·발송·월간리포트·수강료·스케줄이 다 있었는데,
// 문자 보내는 일과 수강료 계산은 수업이 아니다.
//
// 나누는 기준 — **언제 여는가.**
//   오늘    수업 중에 연다 (매일)
//   학생    한 학생을 볼 때 연다
//   학교    학교 시험을 준비할 때 연다
//   교재    학습 자료를 정리할 때 연다 (가끔)
//   일정    앞일을 잡을 때 연다
//   발송    문자를 보낼 때 연다
//   설정    처음 한 번, 그 뒤로는 거의 안 연다
export const SECTIONS = [
  {
    key: "home",
    label: "대시보드",
    href: "/",
    keys: ["home"],
    items: [],
  },
  {
    key: "today",
    label: "오늘",
    href: "/menu/today",
    keys: ["today", "check", "plan"],
    items: [
      { href: "/today", key: "today", label: "오늘 수업", desc: "출결 · 숙제 검사 · 다음 숙제" },
      { href: "/check", key: "check", label: "숙제 검사", desc: "사진 · 녹음 보고 ○△✕" },
      { href: "/plan", key: "plan", label: "수업 준비", desc: "미리 정해두기" },
    ],
  },
  {
    key: "students",
    label: "학생",
    href: "/menu/students",
    keys: ["students", "classes", "scores", "notes", "consult", "tuition"],
    items: [
      { href: "/students", key: "students", label: "재원생", desc: "명단 · 교재 · 계정 · 상담" },
      { href: "/scores", key: "scores", label: "성적", desc: "내신 · 모의고사 · 오답" },
      { href: "/classes", key: "classes", label: "반 · 학생 배정", desc: "반 만들기 · 배정" },
      { href: "/notes", key: "notes", label: "상담일지", desc: "받아쓰기 · 정리" },
      { href: "/consult", key: "consult", label: "신규 상담", desc: "문의 · 레벨테스트" },
      { href: "/tuition", key: "tuition", label: "수강료", desc: "회차 · 보강 · 미납" },
    ],
  },
  {
    // 학교와 그 학교 시험은 한 덩어리다 — 등급컷·출제샘·범위·자료가 전부
    // 「그 학교 그 회차」 에 매달려 있다 (0073~0076)
    key: "schools",
    label: "학교",
    href: "/menu/schools",
    keys: ["schools", "prep"],
    items: [
      { href: "/schools", key: "schools", label: "학교 · 시험", desc: "학교 명단 · 시험 회차 · 등급컷 · 학사일정 받기" },
      { href: "/prep", key: "prep", label: "내신 대비", desc: "시험범위 · 자료 · 학생 배정" },
    ],
  },
  {
    key: "books",
    label: "교재",
    href: "/menu/books",
    keys: ["textbooks", "homework", "videos"],
    items: [
      { href: "/textbooks", key: "textbooks", label: "교재 · 단원", desc: "단원 올리기 · 루틴" },
      { href: "/homework", key: "homework", label: "학습 항목", desc: "숙제 종류 · 체크리스트" },
      { href: "/videos", key: "videos", label: "영상", desc: "배정 · 누가 봤나" },
    ],
  },
  {
    key: "calendar",
    label: "일정",
    href: "/menu/calendar",
    keys: ["tasks", "schedule"],
    items: [
      { href: "/tasks", key: "tasks", label: "할일 · 달력", desc: "처리할 것 · 학사일정" },
      { href: "/schedule", key: "schedule", label: "수업 스케줄", desc: "휴강 · 공휴일 · 3개월 회차" },
    ],
  },
  {
    // 문자 보내는 일은 수업이 아니다. 보내는 것끼리 모아둔다
    key: "send",
    label: "발송",
    href: "/menu/send",
    keys: ["report", "monthly", "messages"],
    items: [
      { href: "/report", key: "report", label: "발송", desc: "데일리리포트 · 하원 · 안내 · 테스트" },
      { href: "/monthly", key: "monthly", label: "월간리포트", desc: "한 달 성취도 · 출결" },
      { href: "/settings/messages", key: "messages", label: "문자 문구", desc: "문구 · 알림톡 템플릿" },
    ],
  },
  {
    key: "settings",
    label: "설정",
    href: "/menu/settings",
    keys: ["settings", "import", "sql"],
    items: [
      { href: "/settings", key: "settings", label: "발송 · 연동", desc: "솔라피 · 알림톡 · 나이스" },
      { href: "/settings/sql", key: "sql", label: "Supabase · AI 키", desc: "SQL · 학생 계정 · AI" },
      { href: "/import", key: "import", label: "노션 이관", desc: "가져오기 · 날짜 고치기" },
    ],
  },
];

/**
 * 화면 전부를 한 줄로 편 것 — 위에 **항상 늘어놓기** 위한 목록.
 *
 * 묶음을 눌러 들어갔다 나오는 것은 한 번에 두 번을 누르는 일이다.
 * 원장님은 수업 중에 이걸 누른다. 어디 있는지 찾을 시간이 없다.
 * 그래서 전부 위에 펴둔다. 묶음은 **줄 바꿈의 기준**으로만 남는다.
 */
export const ALL_ITEMS = SECTIONS.flatMap((sec) =>
  sec.items.length === 0
    ? [{ href: sec.href, key: sec.key, label: sec.label, group: sec.key }]
    : sec.items.map((it) => ({ ...it, group: sec.key }))
);

/** 지금 보고 있는 화면이 어느 묶음인가 */
export function sectionOf(active) {
  return SECTIONS.find((s) => s.keys.includes(active))?.key || null;
}

export function findSection(key) {
  return SECTIONS.find((s) => s.key === key) || null;
}

/**
 * 이 사람의 메뉴 — 숨긴 것을 빼고, 정한 순서대로 (0067).
 *
 * 정한 순서에 없는 화면은 **뒤에 원래 순서대로 붙는다.** 새 화면을 만들었을 때
 * 순서를 다시 정하지 않았다고 사라지면 안 되기 때문이다.
 */
export function menuFor(profile) {
  const hidden = new Set(profile?.menu_hidden || []);
  const order = (profile?.menu_order || []).filter((k) => !hidden.has(k));
  const rest = ALL_ITEMS.filter((i) => !hidden.has(i.key) && !order.includes(i.key));
  const byKey = new Map(ALL_ITEMS.map((i) => [i.key, i]));
  return [...order.map((k) => byKey.get(k)).filter(Boolean), ...rest];
}
