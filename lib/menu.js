// 메뉴는 **한 겹만** 보인다.
//
// 앞에 아홉 개가 늘어서 있으면 매번 어디였는지 찾게 된다. 그래서 위에는
// 큰 이름 다섯 개만 두고, 들어가면 그 안의 화면들을 고르게 한다.
//
// TopBar 와 묶음 페이지가 **같은 목록**을 쓴다. 두 군데에 적으면 언젠가
// 한쪽만 고치게 된다.

export const SECTIONS = [
  {
    key: "home",
    label: "대시보드",
    href: "/",                       // 묶음 없이 바로 간다
    keys: ["home"],
    items: [],
  },
  {
    key: "class",
    label: "수업",
    href: "/menu/class",
    keys: ["today", "check", "plan", "prep", "report", "monthly", "schedule", "tasks", "tuition"],
    items: [
      { href: "/today", key: "today", label: "오늘 수업", desc: "출결 · 숙제 검사 · 다음 숙제" },
      { href: "/check", key: "check", label: "숙제 검사", desc: "사진 · 녹음 보고 ○△✕" },
      { href: "/plan", key: "plan", label: "수업 준비", desc: "미리 정해두기" },
      { href: "/prep", key: "prep", label: "내신 대비", desc: "시험범위 · 자료 · 학생 배정" },
      { href: "/report", key: "report", label: "발송", desc: "데일리리포트 · 하원 · 안내 · 다시 보내기" },
      { href: "/monthly", key: "monthly", label: "월말 리포트", desc: "한 달 성취도 · 출결" },
      { href: "/tasks", key: "tasks", label: "할일 · 일정", desc: "처리할 것 · 학사일정 · 전달사항" },
      { href: "/schedule", key: "schedule", label: "수업 스케줄 · 시험", desc: "휴강 · 시험 기간" },
      { href: "/tuition", key: "tuition", label: "수강료", desc: "회차 · 보강 · 차액" },
    ],
  },
  {
    key: "students",
    label: "학생",
    href: "/menu/students",
    keys: ["students", "classes", "notes", "consult"],
    items: [
      { href: "/students", key: "students", label: "재원생", desc: "명단 · 계정 · 상담" },
      { href: "/classes", key: "classes", label: "반 · 학생 배정", desc: "반 만들기 · 배정" },
      { href: "/notes", key: "notes", label: "상담일지", desc: "받아쓰기 · 정리" },
      { href: "/consult", key: "consult", label: "신규 상담", desc: "문의 · 레벨테스트" },
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
    key: "settings",
    label: "설정",
    href: "/menu/settings",
    keys: ["settings", "messages", "import", "sql"],
    items: [
      { href: "/settings", key: "settings", label: "발송 · 연동", desc: "솔라피 · 알림톡" },
      { href: "/settings/messages", key: "messages", label: "문자 문구", desc: "종류별 문구" },
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
