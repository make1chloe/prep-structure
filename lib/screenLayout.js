/**
 * **화면 구성 순서는 원장님이 정하신다** (원장님, 2026-08-06).
 *
 * 「화면에서 모든 페이지 — 학생 학부모 포함 — 구성 내용 순서를 수정할 수 있게 해줘」
 *
 * 무엇을 먼저 보여줄지는 학원마다 다르다. 어떤 학원은 숙제가 먼저고, 어떤
 * 학원은 이번 달 성취도가 먼저다. 학기 중과 방학 중이 다르기도 하다.
 * 그리고 순서 하나 바꾸자고 나를 부르고 배포를 기다리셔야 하는 것이 이상하다.
 *
 * 규칙은 두 가지다.
 *   1. **정한 것이 앞으로**, 안 정한 것은 원래 차례 그대로 뒤에.
 *      새 덩어리를 만들었는데 순서를 안 정했다고 화면에서 사라지면,
 *      만든 사람도 모르는 채로 지나간다 (0067 의 메뉴와 같은 규칙).
 *   2. **비어 있는 덩어리는 원래도 안 그려진다.** 순서를 정한다고 없던 것이
 *      생기지는 않는다 — 이번 달 수업이 없으면 「이번 달 현황」 은 안 뜬다.
 */

/**
 * 화면마다 어떤 덩어리가 있나.
 *
 * `desc` 는 설정 화면에서 「이게 무슨 덩어리인가」 를 알려주는 말이다.
 * 이름만 봐서는 「일정 및 전달사항」 과 「달력」 이 어떻게 다른지 알 수 없다.
 */
export const PAGES = [
  {
    key: "me",
    label: "학생 화면",
    href: "/me",
    hint: "아이가 앱을 열면 보는 화면입니다. 위에 있는 것부터 봅니다.",
    /**
     * **차례는 위 메뉴(NAV_GROUPS)와 같아야 한다** (원장님, 2026-08-14 —
     * 「학부모·학생 메뉴 순서랑 실제 배치 순서 통일해줘」).
     * 원장님이 화면 설정에서 정한 차례(screen_layouts)는 이보다 우선한다.
     *
     * **탭 개편 (원장 확정 2026-08-27)**: 학생 화면은 네 탭(등원·숙제·일정·
     * 성장)이고, 옛 큰 덩어리 셋을 탭에 맞게 쪼갰다. 옛 키 → 새 키 이관은
     * 0174 SQL — 원장이 실 DB 에서 실행하고 확인 select 로 옛 키 0 을 본
     * 뒤(2026-08-27), 코드 호환층(LEGACY_KEYS·expandLegacy·upgradeLayout·
     * 거울)은 C4 에서 제거했다. 시험 적기의 키가 옛 블록 키와 안 겹치는
     * **write** 인 것은 일부러다 — 이름이 겹치면 이관·호환층이 옛/새를
     * 구분 못 한다 (실행계획서 v5, 4차 중대 1).
     */
    blocks: [
      // 등원 (in)
      { key: "arrival", label: "등원 절차", desc: "핸드폰 · 출석 · 숙제 제출", nav: "등원 체크" },
      { key: "prep", label: "받을 자료", desc: "내신 자료를 받으면 눌러요 (종이는 학원에서만)", nav: "받을 자료" },
      { key: "inclass", label: "등원 중 할 일", desc: "선생님이 정한 차례대로 · 타이머", nav: "할 일" },
      { key: "break", label: "쉬는 시간", desc: "자리 비울 때 누르기", nav: "쉬는 시간" },
      { key: "state", label: "선생님 부르기", desc: "질문 있어요 · 검사해주세요", nav: "부르기" },
      { key: "stay", label: "남아서 하고 갈 것", desc: "늦귀가 과제", nav: "남아서" },
      { key: "leave", label: "하원할게요", desc: "학원 안에서만 · 어머니께 알림", nav: "하원" },
      // 숙제 (hw)
      { key: "homework", label: "하원 후 숙제", desc: "자유 이동 · 타이머 · 제출", nav: "숙제" },
      { key: "videos", label: "볼 영상", nav: "영상" },
      { key: "dict", label: "영어사전", desc: "모르는 단어 바로 찾기", nav: "사전" },
      { key: "question", label: "선생님께 질문", desc: "최근 수업에 대한 질문", nav: "질문" },
      // 일정 (cal)
      { key: "schedule", label: "일정 및 전달사항", desc: "다가오는 일정 · 학원 공지", nav: "알림" },
      { key: "calendar", label: "달력", desc: "수업일 · 시험 · 결석", nav: "달력" },
      { key: "guide", label: "수업 가이드", desc: "설정에 넣은 링크", nav: "가이드" },
      { key: "request", label: "보내기", desc: "결석 · 학교 유인물 전달", nav: "보내기" },
      // 성장 (grow) — 차례는 원장 확정 기본안 (checked→month→last→growth→write)
      { key: "checked", label: "지난 숙제 검사", desc: "○ △ ✕ 결과", nav: "검사" },
      { key: "month", label: "이번 달 현황", desc: "출결 · 숙제 · 단어 · 문법", nav: "이번달" },
      { key: "last", label: "성장 기록", desc: "단어 · 문장 점수 · 진도", nav: "내 기록" },
      { key: "growth", label: "성장 그래프", desc: "모의고사 · 내신 · 단원평가 흐름", nav: "그래프" },
      { key: "write", label: "시험 결과 적기", desc: "모의고사 · 내신 오답 (아이가 직접)", nav: "시험" },
    ],
  },
  {
    key: "parent",
    label: "학부모 화면",
    href: "/parent",
    hint: "어머니가 보시는 화면입니다. 알림톡을 끊었으니 여기가 학원의 말이 닿는 자리입니다.",
    // 차례는 위 메뉴(NAV_GROUPS.parent)와 같아야 한다 — 위 학생 화면과 같은 까닭
    blocks: [
      // 오늘
      { key: "today", label: "오늘", desc: "다음 수업 · 오늘 출결 · 늦은 하원", nav: "오늘" },
      // 숙제·수업
      { key: "homework", label: "지금 나간 숙제", desc: "아이 화면과 같은 목록", nav: "숙제" },
      { key: "lessons", label: "최근 수업", desc: "출결 · 점수 · 진도 · 숙제 검사", nav: "최근 수업" },
      // 공지
      { key: "schedule", label: "일정 및 전달사항", desc: "다가오는 일정 · 학원 공지", nav: "알림" },
      // 성장
      { key: "month", label: "이번 달 현황", desc: "출결 · 숙제 · 단어 · 문법", nav: "이번달" },
      { key: "scores", label: "성장", desc: "내신 · 모의고사 · 단원평가", nav: "성적" },
      { key: "monthly", label: "월간리포트", nav: "월간" },
      // 일정
      { key: "calendar", label: "달력", desc: "수업일 · 시험 · 결석", nav: "달력" },
      // 보내기
      { key: "request", label: "보내기", desc: "결석 · 보강 신청", nav: "보내기" },
      { key: "comments", label: "남기실 말씀", desc: "최근 수업에 대한 문의", nav: "말씀" },
    ],
  },
];

/**
 * 학생·학부모 화면의 **대메뉴** (원장님, 2026-08-14).
 *
 * > 「메뉴 자체를 정확하게 전부 다 세분화하지 말고, 학생이 직관적으로
 * >  선택할 수 있는 대메뉴를 두고 그 안에서 해결할 수 있게. 소메뉴는
 * >  대메뉴에 항상 붙어 다니지 않고 상세로 들어가면 그 위에 뜨게.
 * >  이유는, 학생들은 별생각 없이 아무거나 누르기 때문」
 *
 * 대메뉴는 **가로 스크롤 없이 한 줄에 다 보이는 수**(5~6개)로 묶는다.
 * 어느 덩어리가 어느 대메뉴인지는 여기 한 곳에만 적는다 — 소개 화면과
 * 위 메뉴가 같은 것을 읽는다.
 */
export const NAV_GROUPS = {
  // 이름과 차례는 원장님이 정하셨다 (2026-08-14 — 「업로드 공지 일정 학습
  // 성장 순으로」). 학부모 화면의 같은 갈래도 같은 말을 쓴다 — 아이 화면과
  // 학부모 화면이 같은 것을 다른 이름으로 부르면 집에서 대화가 어긋난다.
  // 학생 화면은 **탭 네 개** (원장 확정 2026-08-27 — 「탭은 항상 네 개를
  // 유지」). 이 묶음이 곧 탭이다 — MeTabs·설정→화면·소개가 전부 이걸 읽는다.
  // TAB_BLOCKS 류 별개 상수를 만들지 않는다 (원칙 1 — 판단은 한 벌).
  me: [
    { key: "in", nav: "등원", blocks: ["arrival", "prep", "inclass", "break", "state", "stay", "leave"] },
    { key: "hw", nav: "숙제", blocks: ["homework", "videos", "dict", "question"] },
    { key: "cal", nav: "일정", blocks: ["schedule", "calendar", "guide", "request"] },
    { key: "grow", nav: "성장", blocks: ["checked", "month", "last", "growth", "write"] },
  ],
  parent: [
    { key: "today", nav: "오늘", blocks: ["today"] },
    { key: "class", nav: "숙제·수업", blocks: ["homework", "lessons"] },
    { key: "news", nav: "공지", blocks: ["schedule"] },
    { key: "record", nav: "성장", blocks: ["month", "scores", "monthly"] },
    { key: "cal", nav: "일정", blocks: ["calendar"] },
    { key: "send", nav: "보내기", blocks: ["request", "comments"] },
  ],
};

export function findPage(key) {
  return PAGES.find((p) => p.key === key) || null;
}

/**
 * **성장은 학생에게 비공개가 기본** (원장 확정 2026-08-27).
 *
 * 'me' 행이 **없으면** hidden = 이 기본, 행이 있으면 hidden_keys 가 전체
 * 진실이다 (실행계획서 v5 §4-1 — 새 컬럼 없이 의미론으로 푼다).
 * 「원래대로」(행 삭제)가 곧 이 기본 복귀다. 설정→화면의 블록 토글이
 * 기본을 이긴다. 다섯 키는 0174 SQL 의 병합 목록과 **한 벌** — 저쪽을
 * 고치면 여기도 같이 고친다.
 */
export const DEFAULT_HIDDEN = {
  me: ["checked", "month", "last", "growth", "write"],
};

/**
 * 정해둔 차례를 읽어온다.
 *
 * **표가 없어도 화면은 그대로 열려야 한다** (SQL 이 밀려 있을 수 있다).
 * 그때는 빈 값이 나오고, 화면은 원래 차례대로 그려진다.
 */
export async function loadLayouts(supabase) {
  const { data, error } = await supabase
    .from("screen_layouts")
    .select("page, order_keys, hidden_keys");
  if (error) return new Map();
  return new Map(
    (data || []).map((r) => [
      r.page,
      { order: r.order_keys || [], hidden: new Set(r.hidden_keys || []) },
    ])
  );
}

/**
 * 이 화면의 덩어리를 **정해진 차례로** 돌려준다.
 *
 * @param pageKey  'me' | 'parent'
 * @param layouts  loadLayouts() 가 준 것
 * @returns [덩어리 key] — 숨긴 것은 빠진다
 */
export function arrange(pageKey, layouts) {
  const page = findPage(pageKey);
  if (!page) return [];
  // 행이 없으면 숨김 = 코드 기본 (성장 비공개 기본 — §4-1 의미론).
  // 행이 있으면 hidden_keys 가 전체 진실이다.
  const saved =
    layouts?.get?.(pageKey) ||
    { order: [], hidden: new Set(DEFAULT_HIDDEN[pageKey] || []) };
  const rank = new Map(saved.order.map((k, i) => [k, i]));

  return page.blocks
    .map((b, i) => ({ key: b.key, at: i }))
    .filter((b) => !saved.hidden.has(b.key))
    // 정한 것이 앞으로. 안 정한 것은 원래 차례 그대로 뒤에 —
    // 새 덩어리를 만들었을 때 순서를 안 정했다고 사라지면 안 된다
    .sort((a, b) => {
      const ra = rank.has(a.key) ? rank.get(a.key) : Infinity;
      const rb = rank.has(b.key) ? rank.get(b.key) : Infinity;
      return ra - rb || a.at - b.at;
    })
    .map((b) => b.key);
}
