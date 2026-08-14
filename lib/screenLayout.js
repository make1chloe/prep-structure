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
    blocks: [
      { key: "month", label: "이번 달 현황", desc: "출결 · 숙제 · 단어 · 문법", nav: "이번달" },
      { key: "schedule", label: "일정 및 전달사항", desc: "다가오는 일정 · 학원 공지", nav: "알림" },
      { key: "study", label: "하원 숙제 · 등원학습", desc: "등원 체크 · 타이머 · 전체 목록", nav: "할 것" },
      { key: "last", label: "성장 기록", desc: "단어 · 문장 점수 · 진도", nav: "내 기록" },
      { key: "checked", label: "지난 숙제 검사", desc: "○ △ ✕ 결과", nav: "검사" },
      { key: "stay", label: "남아서 하고 갈 것", desc: "늦귀가 과제", nav: "남아서" },
      { key: "videos", label: "볼 영상", nav: "영상" },
      { key: "myscore", label: "시험 결과 적기", desc: "모의고사 · 내신 오답 (아이가 직접)", nav: "시험" },
      { key: "help", label: "선생님 도움 · 쉬는 시간", desc: "지금 상태 · 보내는 글 · 질문", nav: "선생님께" },
      { key: "guide", label: "수업 가이드", desc: "설정에 넣은 링크", nav: "가이드" },
      { key: "calendar", label: "달력", desc: "수업일 · 시험 · 결석", nav: "달력" },
    ],
  },
  {
    key: "parent",
    label: "학부모 화면",
    href: "/parent",
    hint: "어머니가 보시는 화면입니다. 알림톡을 끊었으니 여기가 학원의 말이 닿는 자리입니다.",
    blocks: [
      { key: "today", label: "오늘", desc: "다음 수업 · 오늘 출결 · 늦은 하원", nav: "오늘" },
      { key: "month", label: "이번 달 현황", desc: "출결 · 숙제 · 단어 · 문법", nav: "이번달" },
      { key: "schedule", label: "일정 및 전달사항", desc: "다가오는 일정 · 학원 공지", nav: "알림" },
      { key: "homework", label: "지금 나간 숙제", desc: "아이 화면과 같은 목록", nav: "숙제" },
      { key: "lessons", label: "최근 수업", desc: "출결 · 점수 · 진도 · 숙제 검사", nav: "최근 수업" },
      { key: "scores", label: "성장", desc: "내신 · 모의고사 · 단원평가", nav: "성적" },
      { key: "monthly", label: "월간리포트", nav: "월간" },
      { key: "calendar", label: "달력", desc: "수업일 · 시험 · 결석", nav: "달력" },
      { key: "request", label: "보내기", desc: "결석 · 보강 신청", nav: "보내기" },
      { key: "comments", label: "남기실 말씀", desc: "최근 수업에 대한 문의", nav: "말씀" },
    ],
  },
];

export function findPage(key) {
  return PAGES.find((p) => p.key === key) || null;
}

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
  const saved = layouts?.get?.(pageKey) || { order: [], hidden: new Set() };
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
