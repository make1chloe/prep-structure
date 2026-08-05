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
      { href: "/plan", key: "plan", label: "수업 준비", desc: "미리 정해두기 · 지난 수업 고치기" },
    ],
  },
  {
    // 학생 묶음은 **한 아이를 볼 때** 연다. 돈·상담은 여기가 아니라 「운영」 이다
    key: "students",
    label: "학생",
    href: "/menu/students",
    keys: ["students", "classes", "scores"],
    items: [
      { href: "/students", key: "students", label: "재원생", desc: "명단 · 교재 · 계정 · 학부모" },
      { href: "/scores", key: "scores", label: "성적", desc: "내신 · 모의고사 · 오답" },
      { href: "/classes", key: "classes", label: "반 · 학생 배정", desc: "반 만들기 · 배정" },
    ],
  },
  {
    // 학습 자료를 만드는 일. 내신 자료도 결국 **자료 만들기**라 여기다
    key: "books",
    label: "교재",
    href: "/menu/books",
    keys: ["textbooks", "homework", "videos", "prep"],
    items: [
      { href: "/textbooks", key: "textbooks", label: "교재 · 단원", desc: "단원 올리기 · 루틴" },
      { href: "/homework", key: "homework", label: "학습 항목", desc: "숙제 종류 · 체크리스트" },
      { href: "/prep", key: "prep", label: "내신 대비", desc: "시험범위 · 자료 · 학생 배정" },
      { href: "/videos", key: "videos", label: "영상", desc: "배정 · 누가 봤나" },
    ],
  },
  {
    // 앞일을 잡는 곳. 학교 시험도 **날짜**라서 여기가 맞다
    key: "calendar",
    label: "일정",
    href: "/menu/calendar",
    keys: ["tasks", "schedule", "schools"],
    items: [
      { href: "/tasks", key: "tasks", label: "할일 · 달력", desc: "처리할 것 · 학사일정 · 구글 캘린더" },
      { href: "/schedule", key: "schedule", label: "회차 관리", desc: "휴강 · 공휴일 · 3개월 회차" },
      { href: "/schools", key: "schools", label: "학교 · 시험", desc: "학교 명단 · 시험 회차 · 등급컷" },
    ],
  },
  {
    // 나가는 것끼리. 문구도 · 열쇠도 발송에 딸린 이야기다
    key: "send",
    label: "발송",
    href: "/menu/send",
    keys: ["report", "monthly", "messages", "settings"],
    items: [
      { href: "/report", key: "report", label: "발송", desc: "데일리리포트 · 하원 · 안내 · 테스트" },
      { href: "/monthly", key: "monthly", label: "월간리포트", desc: "한 달 성취도 · 출결" },
      { href: "/settings/messages", key: "messages", label: "문자 문구", desc: "문구 · 알림톡 템플릿" },
      { href: "/settings", key: "settings", label: "발송 · 연동", desc: "솔라피 · 알림톡 · 나이스", only: "principal" },
    ],
  },
  {
    // **학원을 굴리는 일.** 가르치는 일과 성격이 다르다 —
    // 돈을 받고 · 상담을 하고 · 새 학생을 받는다
    key: "manage",
    label: "운영",
    href: "/menu/manage",
    keys: ["tuition", "notes", "consult"],
    items: [
      { href: "/tuition", key: "tuition", label: "수강료", desc: "회차 · 보강 · 미납", only: "principal" },
      { href: "/notes", key: "notes", label: "상담일지", desc: "받아쓰기 · 정리" },
      { href: "/consult", key: "consult", label: "신규 상담", desc: "문의 · 레벨테스트" },
    ],
  },
  {
    // 처음 한 번 하고 거의 안 여는 것들
    key: "settings",
    label: "설정",
    href: "/menu/settings",
    keys: ["screen", "sql", "import"],
    items: [
      { href: "/settings/screen", key: "screen", label: "화면", desc: "맨 위 메뉴 · 밝게 · 어둡게" },
      { href: "/settings/sql", key: "sql", label: "Supabase · AI 키", desc: "SQL · 학생 계정 · AI", only: "principal" },
      { href: "/import", key: "import", label: "노션 이관", desc: "가져오기 · 날짜 고치기", only: "principal" },
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
 * **묶음은 절대 안 깨진다.**
 *
 * 예전에는 「정한 순서」를 통째로 앞에 세우고 나머지를 뒤에 붙였다. 그러면
 * 순서를 한 번이라도 손대는 순간 묶음이 흩어진다 — 「발송」 이 두 군데로 갈리고,
 * 「대시보드」 가 두 번 나온다. 실제로 그렇게 보였다.
 *
 * 그래서 이제 **묶음이 먼저다.** 묶음은 SECTIONS 에 적힌 차례대로 나오고,
 * 「정한 순서」는 **그 묶음 안에서만** 자리를 바꾼다. 원장님이 아무리 순서를
 * 흔들어도 「발송」 은 한 덩어리로 남는다.
 */
export function menuFor(profile) {
  // **원장님만 보는 화면이 있다.** 돈과 열쇠가 그것이다 (0079).
  // 조교가 실수로 열어서 곤란해지는 것보다, 아예 안 보이는 편이 낫다.
  // 화면에서 감추는 것은 예의고, 진짜 자물쇠는 DB 쪽 정책이다.
  const role = profile?.role || "";
  const allowed = (i) => !i.only || i.only === role;
  const hidden = new Set(profile?.menu_hidden || []);
  const rank = new Map((profile?.menu_order || []).map((k, i) => [k, i]));

  const out = [];
  for (const sec of SECTIONS) {
    const mine = ALL_ITEMS.filter(
      (i) => i.group === sec.key && allowed(i) && !hidden.has(i.key)
    );
    if (mine.length === 0) continue;
    // 정한 순서에 있는 것이 앞으로. 없는 것은 원래 차례 그대로 뒤에.
    // (새 화면을 만들었을 때 순서를 다시 안 정했다고 사라지면 안 된다)
    const idx = new Map(mine.map((i, n) => [i.key, n]));
    mine.sort((a, b) => {
      const ra = rank.has(a.key) ? rank.get(a.key) : Infinity;
      const rb = rank.has(b.key) ? rank.get(b.key) : Infinity;
      return ra - rb || idx.get(a.key) - idx.get(b.key);
    });
    out.push(...mine);
  }
  return out;
}
