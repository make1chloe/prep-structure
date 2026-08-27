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
//   학습    무엇을 가르치나 — 교재·학습항목·내신·영상 (가끔)
//   일정    앞일을 잡을 때 연다
//   발송    문자를 보낼 때 연다
//   설정    처음 한 번, 그 뒤로는 거의 안 연다
/**
 * **묶음마다 제 색** (원장님, 2026-08-13 — 「전반적으로 하위메뉴가 색깔 등에
 * 의한 정보구별이 너무 비효과적이야」).
 *
 * 여덟 묶음이 전부 같은 보라 알약이었다. 색이 있는데 **아무것도 안 알려주는
 * 색**이라, 「발송이 어디였지」 를 매번 글자로 읽어야 했다. 색이 다르면
 * 자리를 손이 먼저 기억한다.
 *
 * 색은 여섯뿐이라 몇은 겹친다 — **옆에 있는 묶음끼리만 안 겹치면 된다**
 * (학습 항목 분류가 이미 같은 규칙이다).
 * 관리자는 회색이다 — 거의 안 여는 것이라는 뜻이 색에도 담긴다.
 */
export const SECTIONS = [
  {
    key: "home",
    tone: "navy",
    label: "대시보드",
    href: "/",
    keys: ["home"],
    items: [],
  },
  {
    key: "today",
    tone: "sky",
    label: "오늘",
    href: "/menu/today",
    keys: ["today", "check", "progress", "plan"],
    items: [
      { href: "/today", key: "today", label: "오늘 수업" },
      { href: "/check", key: "check", label: "숙제 검사" },
      // 학생별로 죽 훑으며 「오늘 어디 하고 있나」 를 적는 자리 (원장님, 2026-08-14)
      { href: "/progress", key: "progress", label: "진도", desc: "학생별 교재 · 단원 체크" },
      // **출결은 한 자리에** (원장님, 2026-08-07). 결석 예정을 넣는 칸만 있고
      // 무르는 자리는 대시보드에 있어서, 잡아둔 보강 하나 지우려면 화면을
      // 옮겨 다녀야 했다
      { href: "/plan", key: "plan", label: "출결", desc: "결석 예정 · 보강" },
    ],
  },
  {
    // 학생 묶음은 **한 아이를 볼 때** 연다. 돈·상담은 여기가 아니라 「운영」 이다
    key: "students",
    tone: "mint",
    label: "학생",
    href: "/menu/students",
    keys: ["students", "classes", "scores"],
    items: [
      { href: "/students", key: "students", label: "재원생" },
      { href: "/scores", key: "scores", label: "성장" },
      { href: "/classes", key: "classes", label: "수업", desc: "반 · 학생 배정" },
    ],
  },
  {
    // 학습 자료를 만드는 일. 내신 자료도 결국 **자료 만들기**라 여기다
    key: "books",
    tone: "lav",
    label: "학습",
    href: "/menu/books",
    keys: ["textbooks", "videos", "prep"],
    items: [
      /**
       * 학습항목(정독 · 문제풀기 같은 「하는 것」)은 이제 교재 화면의 탭이다
       * (원장님 확정, 2026-08-27) — 들어오는 링크가 없는 화면이 메뉴 한 칸을
       * 차지하고 있었다. 옛 /homework 주소는 /textbooks?view=items 로 넘어간다.
       */
      { href: "/textbooks", key: "textbooks", label: "교재", desc: "교재 · 단원 · 학습항목" },
      { href: "/prep", key: "prep", label: "내신", desc: "시험범위 · 자료" },
      { href: "/videos", key: "videos", label: "영상" },
    ],
  },
  {
    // 앞일을 잡는 곳. 학교 시험도 **날짜**라서 여기가 맞다
    key: "calendar",
    tone: "amber",
    label: "일정",
    href: "/menu/calendar",
    keys: ["tasks", "schedule", "schools"],
    items: [
      { href: "/tasks", key: "tasks", label: "달력", desc: "일정 · 할일" },
      { href: "/schedule", key: "schedule", label: "회차", desc: "휴강 · 회차 관리" },
      /**
       * 나이스 원본(바꾸기 전을 보는 자리, 8/9 확정)은 이제 「시험」 화면 안
       * 접힘 상자다 (원장님 확정, 2026-08-27) — 메뉴 한 칸을 차지할 만큼
       * 자주 열지 않는다. 옛 /neis 주소는 /schools 로 넘어간다.
       */
      { href: "/schools", key: "schools", label: "시험", desc: "학교 · 시험" },
    ],
  },
  {
    /**
     * **보낼 것을 보는 자리** (원장님, 2026-08-07 — 「연동에 대한 거 자체를
     * 설정으로 다 옮겨. 발송은 정말 발송할 내용을 확인하고 발송 처리만.
     * 문자문구도」).
     *
     * 전에는 문구와 열쇠까지 여기 뒀다 — 「나가는 것끼리」 라는 생각이었다.
     * 그런데 그 둘은 **한 번 정해두고 안 여는 것**이고, 발송은 **매일**
     * 연다. 성격이 다른 것이 섞여 있으면, 매일 쓰는 자리에서 매번 눈으로
     * 걸러야 한다. 실제로 앱 알림 설정이 「발송 · 연동」 안에 숨어 있어서
     * 못 찾으셨다.
     */
    key: "send",
    tone: "red",
    label: "발송",
    href: "/menu/send",
    keys: ["report", "monthly"],
    items: [
      { href: "/report", key: "report", label: "발송", desc: "데일리리포트 · 하원 · 안내" },
      { href: "/monthly", key: "monthly", label: "월간리포트" },
    ],
  },
  {
    // **학원을 굴리는 일.** 가르치는 일과 성격이 다르다 —
    // 돈을 받고 · 상담을 하고 · 새 학생을 받는다
    key: "manage",
    tone: "navy",
    label: "운영",
    href: "/menu/manage",
    keys: ["tuition", "notes", "consult"],
    items: [
      { href: "/tuition", key: "tuition", label: "수강료", only: "principal" },
      { href: "/notes", key: "notes", label: "상담일지" },
      { href: "/consult", key: "consult", label: "신규 상담", desc: "문의 · 레벨테스트" },
    ],
  },
  {
    // 처음 한 번 하고 거의 안 여는 것들
    key: "settings",
    tone: "grey",
    label: "관리자",
    href: "/menu/settings",
    /**
     * admin · import 는 메뉴 항목이 아니어도 keys 에 남는다 — admin 은 옛
     * /settings/admin 리다이렉트, import 는 설정 아래 칸에서 여는 살아 있는
     * 화면이라, 거기 있을 때도 이 묶음이 켜져야 한다. sql 은 SQL 화면이
     * active="settings" 로 서 있어 쓰는 곳이 없었다 — 뺐다 (2026-08-27).
     */
    keys: ["settings", "messages", "screen", "admin", "import"],
    items: [
      // **알림 · 문자가 나가는 길** — 한 번 맞춰두고 거의 안 여는 것이다.
      // 앱 알림 켜기와 테스트도 여기 있다 (원장님이 「발송」 에서 못 찾으셨다)
      /**
       * **넣는 것은 여기 한 곳** (2026-08-07 — 「api, 솔라피, 등등 입력값이
       * 필요한걸 한페이지에 모아야하지 않을까?」). 나이스 키가 「학교 · 시험」
       * 안에, AI 키가 「Supabase · AI 키」 에 따로 있었다
       */
      { href: "/settings", key: "settings", label: "설정", desc: "키 · 앱 알림 · 운영 규칙 · SQL", only: "principal" },
      /**
       * **미리 적어두는 말은 한 자리에** (2026-08-07). 「문자 문구」 와
       * 「안내 문구」 가 나란히 두 칸을 차지하고 있었다 — 이름이 비슷해서
       * 어느 쪽이 어느 쪽인지 매번 헷갈렸고, 하는 일은 하나였다.
       * 다른 것은 어디로 나가느냐뿐이라 한 화면 안의 두 칸으로 넣었다.
       */
      { href: "/settings/messages", key: "messages", label: "문구", desc: "나가는 문자 · 화면 안내" },
      { href: "/settings/screen", key: "screen", label: "화면", desc: "메뉴 · 테마 · 로고 · 아이콘" },
      /**
       * **「관리자」 라는 화면은 없앴다** (원장님, 2026-08-13 — 「대메뉴를
       * 관리자로 하고, 설정·문구·화면으로 나눠. 관리자 페이지는 각각 설정,
       * 화면으로 나눠서 페이지를 아예 없애」).
       *
       * 묶음 이름이 이미 「관리자」인데 그 안에 또 「관리자」가 있으면, 어느
       * 쪽이 어느 쪽인지 매번 헷갈린다. 알맹이는 성격대로 나눠 넣었다 —
       * 표 만들기·옛 자료 옮기기는 **설정**, 아이콘은 **화면**.
       * 옛 주소(/settings/admin)는 설정으로 넘긴다.
       */
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
 * **지금 보고 있는 주소가 어느 화면인가.**
 *
 * 전에는 화면마다 `<TopBar active="today" />` 라고 손으로 적어 넘겼다.
 * 위 메뉴가 뿌리 레이아웃으로 올라가면서(성능수리 3차) 그 자리가 없어졌다 —
 * 레이아웃은 어느 화면이 열렸는지 모르고, 알더라도 화면을 옮길 때마다
 * 다시 그려지지 않는다(실측: 소프트 이동에서 레이아웃은 재렌더 안 됨).
 * 그래서 **주소에서 판정한다** (components/NavGrid 가 usePathname 으로 부른다).
 *
 * 표를 새로 만들지 않는다 — 위의 SECTIONS·ALL_ITEMS 가 이미 주소를 알고
 * 있다. 두 벌로 적으면 화면 하나 옮길 때 한쪽만 고치게 된다 (원칙 1).
 */
export function keyOfPath(pathname) {
  if (!pathname) return "";
  // 물음표·끝 빗금을 떼고 본다 (/textbooks?view=items · /students/)
  const p = pathname.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  if (p === "/") return "home";

  // 묶음 화면(/menu/today)은 그 묶음이 켜진다 — 예전에 손으로 넘기던 값과 같다
  const m = /^\/menu\/([^/]+)$/.exec(p);
  if (m) return findSection(m[1])?.key || "";

  /**
   * 긴 주소부터 본다 — `/settings/messages` 가 `/settings` 보다 먼저 잡혀야
   * 「문구」 가 켜진다. 하위 주소(`/scores/12` · `/settings/sql`)는 부모 화면이
   * 켜진다 — 예전에 그 화면들이 손으로 넘기던 값과 같다.
   */
  const hit = ALL_ITEMS.filter((i) => i.href !== "/")
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => p === i.href || p.startsWith(`${i.href}/`));
  if (hit) return hit.key;

  /**
   * 메뉴에 칸이 없는 화면(`/import` — 설정 아래 칸에서 여는 곳)은 첫 마디를
   * 그대로 열쇠로 쓴다. SECTIONS 의 `keys` 에 적혀 있으면 그 묶음이 켜진다
   * (sectionOf). 적혀 있지 않으면 아무 데도 안 켜진다 — 전에도 그랬다.
   */
  return p.split("/")[1] || "";
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
