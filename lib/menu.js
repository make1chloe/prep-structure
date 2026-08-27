// 화면 목록은 **여기 하나뿐이다.**
// TopBar 와 묶음 페이지가 같은 것을 읽는다 — 두 군데에 적으면 언젠가
// 한쪽만 고치게 된다.

/**
 * **대메뉴 다섯** (원장님 확정, 2026-08-28).
 *
 *   대시보드 — 오늘수업, 재원생, 리포트, 숙제검사  ※ 일일·월간은 리포트 화면의 탭
 *   일정     — 출결, 시험, 달력, 할일
 *   학습     — 내신범위, 교재, 영상
 *   성장     — 신규상담, 상담일지, 성적
 *   관리자   — 회차, 수납, 설정, 문구, 화면
 *
 * ── 왜 여덟에서 다섯으로 ─────────────────────────────────
 *
 * 여덟 묶음은 **접혔을 때 한 줄에 안 들어갔다.** 굴려 내리면 이름만 남는데,
 * 그 이름이 여덟이라 폰에서는 그 줄이 다시 두 줄이 됐다. 이름을 여덟 개
 * 훑는 것은 「어디였지」 를 여덟 번 묻는 일이기도 하다.
 *
 * 나누는 기준이 「언제 여는가」 에서 **「무엇을 보러 왔는가」** 로 바뀌었다.
 *   대시보드  매일 도는 것 — 오늘 · 아이 · 보낼 것 · 검사 (여기가 첫 화면이다)
 *   일정      날짜에 매인 것 — 출결 · 시험 · 달력 · 할일
 *   학습      무엇을 어디까지 가르치나 — 내신 · 교재 · 진도 · 영상
 *   성장      한 아이가 어떻게 크고 있나 — 상담 · 기록 · 성적
 *   관리자    학원을 굴리는 것 · 한 번 맞춰두는 것
 *
 * ── 원장님 목록에 없던 두 화면 ───────────────────────────
 *
 * **진도**(`/progress`)는 「그냥 없애지마」 라고 하셨다. 학습 묶음에 넣는다 —
 * 교재를 정하는 자리 바로 옆이 「그 교재를 어디까지 했나」 이다. 매일 쓰는
 * 것이라 대시보드도 후보였지만, 대시보드 네 칸은 원장님이 직접 고르신
 * 목록이라 임의로 늘리지 않는다.
 *
 * **수업**(`/classes`, 반 · 학생 배정)은 관리자에 넣는다. 학기 초에 한 번
 * 짜고 거의 안 여는 것이고, 바로 옆의 「회차」 가 같은 대상(반)을 다룬다 —
 * 반을 만드는 자리와 그 반의 회차를 잡는 자리가 떨어져 있을 이유가 없다.
 */
/**
 * **묶음마다 제 색** (원장님, 2026-08-13 — 「전반적으로 하위메뉴가 색깔 등에
 * 의한 정보구별이 너무 비효과적이야」).
 *
 * 색이 있는데 **아무것도 안 알려주는 색**이면, 「발송이 어디였지」 를 매번
 * 글자로 읽어야 한다. 색이 다르면 자리를 손이 먼저 기억한다.
 *
 * 이제 묶음이 다섯이라 색이 남는다 — 하나도 안 겹친다.
 * 관리자는 회색이다 — 거의 안 여는 것이라는 뜻이 색에도 담긴다.
 */
export const SECTIONS = [
  {
    /**
     * **첫 화면이자 매일 도는 것들** (원장님, 2026-08-28).
     *
     * 묶음 이름을 누르면 `/menu/home` 이 아니라 **대시보드 그 자체**로 간다.
     * 여기는 로그인 첫 화면이고 알림센터다 — 한 번 더 고르게 만들 이유가 없다.
     */
    key: "home",
    tone: "navy",
    label: "대시보드",
    href: "/",
    keys: ["home", "today", "students", "report", "check"],
    items: [
      { href: "/today", key: "today", label: "오늘 수업" },
      { href: "/students", key: "students", label: "재원생" },
      /**
       * **일일과 월간을 합쳐서 「리포트」 한 칸** (원장님, 2026-08-28 —
       * 「일일과 월간을 합쳐서 리포트로 만들고 아래에서 나누기」).
       *
       * 그날 아침 이 칸을 눌렀을 때 하는 일은 하나다 — **보낸다.** 그것이
       * 오늘 것이냐 이번 달 것이냐는 그다음 물음인데, 메뉴에서 먼저 갈라
       * 두면 매번 위에서 고르고 들어가야 했다. 월말에는 두 칸을 오가며
       * 같은 학생 목록을 두 번 열었다.
       *
       * 그래서 나누는 자리를 **화면 안**으로 내렸다 — 「월간리포트」 는
       * `/report` 의 탭이다 (`?t=monthly`). 옛 `/monthly` 주소는 넘긴다
       * (app/todo · app/homework · app/neis 와 같은 관례). 화면도 셈도
       * 하나도 안 바꿨다 — 사는 자리만 옮겼다.
       *
       * 배지도 한 칸으로 합쳐진다 (lib/menuBadges 의 report). 그 편이
       * 오히려 맞다 — 「보낼 것」 탭이 이미 리포트 · 교재 안내 · 월간을
       * 한 숫자로 세고 있었는데, 메뉴만 둘로 갈라 세고 있었다.
       */
      { href: "/report", key: "report", label: "리포트", desc: "일일 · 월간 · 하원 · 안내" },
      { href: "/check", key: "check", label: "숙제 검사" },
    ],
  },
  {
    // **날짜에 매인 것.** 학교 시험도 결국 날짜라서 여기가 맞다
    key: "calendar",
    tone: "amber",
    label: "일정",
    href: "/menu/calendar",
    keys: ["calendar", "plan", "schools", "tasks", "todo"],
    items: [
      /**
       * **출결은 한 자리에** (원장님, 2026-08-07). 결석 예정을 넣는 칸만 있고
       * 무르는 자리는 대시보드에 있어서, 잡아둔 보강 하나 지우려면 화면을
       * 옮겨 다녀야 했다
       */
      { href: "/plan", key: "plan", label: "출결", desc: "결석 예정 · 보강" },
      /**
       * 나이스 원본(바꾸기 전을 보는 자리, 8/9 확정)은 「시험」 화면 안
       * 접힘 상자다 (원장님 확정, 2026-08-27). 옛 /neis 주소는 /schools 로 넘어간다.
       */
      { href: "/schools", key: "schools", label: "시험", desc: "학교 · 시험" },
      /**
       * **달력과 할일은 한 화면의 두 탭이다** (`/tasks` — 같은 tasks 표를 본다).
       * 그런데 메뉴에 「달력」 하나만 있으면 **할일이 어디 있는지 알 수가 없다**
       * — 원장님이 2026-08-28 목록에 둘을 나란히 적으신 까닭이다.
       * 발송과 같은 처리다: 화면을 쪼갠 것이 아니라 들어가는 문을 둘로 냈다.
       */
      { href: "/tasks", key: "tasks", label: "달력", desc: "일정 · 할일" },
      { href: "/tasks?view=todo", key: "todo", label: "할일", desc: "내가 할 일" },
    ],
  },
  {
    // **무엇을 어디까지 가르치나.** 자료(교재·영상·내신)와 그 자료의 진행(진도)
    key: "books",
    tone: "lav",
    label: "학습",
    href: "/menu/books",
    keys: ["books", "prep", "textbooks", "progress", "videos"],
    items: [
      { href: "/prep", key: "prep", label: "내신", desc: "시험범위 · 자료" },
      /**
       * 학습항목(정독 · 문제풀기 같은 「하는 것」)은 이제 교재 화면의 탭이다
       * (원장님 확정, 2026-08-27) — 들어오는 링크가 없는 화면이 메뉴 한 칸을
       * 차지하고 있었다. 옛 /homework 주소는 /textbooks?view=items 로 넘어간다.
       */
      { href: "/textbooks", key: "textbooks", label: "교재", desc: "교재 · 단원 · 학습항목" },
      // 학생별로 죽 훑으며 「오늘 어디 하고 있나」 를 적는 자리 (원장님, 2026-08-14).
      // 교재를 정하는 자리 바로 옆이 그 교재를 어디까지 했나이다 (8/28 재배치)
      { href: "/progress", key: "progress", label: "진도", desc: "학생별 교재 · 단원 체크" },
      { href: "/videos", key: "videos", label: "영상" },
    ],
  },
  {
    /**
     * **한 아이가 어떻게 크고 있나** (원장님, 2026-08-28).
     *
     * 처음 오신 문의 → 다니면서 쌓인 상담 기록 → 성적. 셋이 한 아이의
     * 같은 이야기인데 「운영」 과 「학생」 으로 갈라져 있었다.
     *
     * 묶음이 「성장」 이라 그 안의 화면은 **「성적」** 이다 — 이름이 같으면
     * (예전 「대시보드 대시보드」) 어느 쪽이 어느 쪽인지 매번 헷갈린다.
     */
    key: "growth",
    tone: "mint",
    label: "성장",
    href: "/menu/growth",
    keys: ["growth", "consult", "notes", "scores"],
    items: [
      { href: "/consult", key: "consult", label: "신규 상담", desc: "문의 · 레벨테스트" },
      { href: "/notes", key: "notes", label: "상담일지" },
      { href: "/scores", key: "scores", label: "성적", desc: "시험 성적 · 성장" },
    ],
  },
  {
    /**
     * **학원을 굴리는 것 · 한 번 맞춰두는 것** (원장님, 2026-08-28 —
     * 「관리자 - 회차, 수납, 설정, 문구, 화면」).
     */
    key: "settings",
    tone: "grey",
    label: "관리자",
    href: "/menu/settings",
    /**
     * admin · import 는 메뉴 항목이 아니어도 keys 에 남는다 — admin 은 옛
     * /settings/admin 리다이렉트, import 는 설정 아래 칸에서 여는 살아 있는
     * 화면이라, 거기 있을 때도 이 묶음이 켜져야 한다.
     */
    keys: ["classes", "schedule", "tuition", "settings", "messages", "screen", "admin", "import"],
    items: [
      // 반은 학기 초에 한 번 짠다 — 바로 아래 「회차」 가 같은 반의 회차를 잡는다
      { href: "/classes", key: "classes", label: "수업", desc: "반 · 학생 배정" },
      { href: "/schedule", key: "schedule", label: "회차", desc: "휴강 · 회차 관리" },
      { href: "/tuition", key: "tuition", label: "수강료", only: "principal" },
      // **알림 · 문자가 나가는 길** — 한 번 맞춰두고 거의 안 여는 것이다.
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
       */
      { href: "/settings/messages", key: "messages", label: "문구", desc: "나가는 문자 · 화면 안내" },
      { href: "/settings/screen", key: "screen", label: "화면", desc: "메뉴 · 테마 · 로고 · 아이콘" },
      /**
       * **「관리자」 라는 화면은 없앴다** (원장님, 2026-08-13 — 「대메뉴를
       * 관리자로 하고, 설정·문구·화면으로 나눠. 관리자 페이지는 각각 설정,
       * 화면으로 나눠서 페이지를 아예 없애」). 알맹이는 성격대로 나눠 넣었다 —
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

/**
 * 지금 보고 있는 화면이 어느 묶음인가.
 *
 * 묶음 키 자체도 `keys` 에 들어 있다 — 묶음 화면(`/menu/…`)을 열었을 때
 * 그 대메뉴가 켜져야 「내가 여기 있다」 가 보인다.
 */
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
export function keyOfPath(pathname, search = "") {
  if (!pathname) return "";
  // 물음표·끝 빗금을 떼고 본다 (/textbooks?view=items · /students/)
  const p = pathname.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";

  /**
   * **물음표까지 있는 칸이 먼저다** (2026-08-28). 「달력」과 「할일」은
   * 같은 화면(/tasks)의 두 탭이라 칸의 href 가 `/tasks?view=todo` 다.
   * 물음표를 떼고만 보면 할일 칸이 영영 안 켜진다 — 조용히.
   */
  const q = (search || "").replace(/^\?/, "");
  if (q) {
    const full = `${p}?${q}`;
    const qHit = ALL_ITEMS.filter((i) => i.href.includes("?"))
      .find((i) => full === i.href || full.startsWith(`${i.href}&`));
    if (qHit) return qHit.key;
  }

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
 * 흔들어도 「일정」 은 한 덩어리로 남는다.
 * (「발송」 은 2026-08-28 에 대시보드 안의 「리포트」 한 칸이 되었다 — 위 이야기는
 *  그 묶음이 있던 때의 기록이다)
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
