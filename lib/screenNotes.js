/**
 * **화면 안내 문구는 원장님이 적는다** (원장님, 2026-08-06).
 *
 * 「메뉴에 대한 안내는 설정페이지에서 내가 직접 적게해줘 특히 학생학부모용」
 *
 * 지금까지 화면의 안내는 전부 내가 코드에 박아 넣은 것이었다. 나쁘지 않지만
 * **내 말투**다. 아이들에게 하는 말은 원장님이 제일 잘 아시고, 고치려고
 * 매번 나를 부르셔야 하는 것도 이상하다.
 *
 * 그래서 **자리만 코드가 잡고, 말은 원장님이 적는다.**
 *   · 안 적으시면 원래 문구(fallback)가 그대로 나온다 — 빈 화면이 되면 안 된다
 *   · 적으시면 그것이 대신 나온다
 *
 * 새 자리를 만들 때는 여기 한 줄만 더하면 설정 화면에 저절로 뜬다.
 */

/**
 * 적을 수 있는 자리들.
 *
 * `where` 는 설정 화면에서 「이게 어디에 뜨는 글인가」 를 알려주는 말이다.
 * 이것이 없으면 스무 개의 빈 칸을 앞에 두고 무엇을 적어야 하는지 알 수가 없다.
 */
export const NOTE_GROUPS = [
  {
    key: "me",
    label: "학생 화면",
    hint: "아이가 앱을 열면 보는 화면입니다. 아이 말로 적어주세요.",
    spots: [
      { key: "me.top", label: "맨 위 인사", where: "이름 바로 아래", placeholder: "예) 오늘도 화이팅! 모르는 건 선생님께 물어보세요." },
      { key: "me.month", label: "이번 달 현황", where: "출결·숙제·단어·문법 칸 위" },
      { key: "me.schedule", label: "일정 및 전달사항", where: "다가오는 일정 목록 위" },
      { key: "me.study", label: "하원 숙제 · 등원 학습", where: "할 일 목록 위" },
      { key: "me.sheet", label: "숙제 전체 목록", where: "찍어 가는 목록 위" },
      { key: "me.guide", label: "수업 가이드", where: "링크 목록 위" },
      { key: "me.calendar", label: "달력", where: "달력 위" },
    ],
  },
  {
    key: "parent",
    label: "학부모 화면",
    hint: "어머니가 보시는 화면입니다. 알림톡을 끊었으니 여기가 학원의 말이 닿는 자리입니다.",
    spots: [
      { key: "parent.top", label: "맨 위 인사", where: "아이 이름 바로 아래", placeholder: "예) 궁금하신 점은 아래 「보내기」 로 남겨주시면 확인 후 답드립니다." },
      { key: "parent.today", label: "오늘", where: "다음 수업 · 출결 칸 위" },
      { key: "parent.month", label: "이번 달 현황", where: "출결·숙제·단어·문법 칸 위" },
      { key: "parent.schedule", label: "일정 및 전달사항", where: "일정·공지 목록 위" },
      { key: "parent.homework", label: "지금 나간 숙제", where: "숙제 목록 위" },
      { key: "parent.lessons", label: "최근 수업", where: "수업 기록 위" },
      { key: "parent.scores", label: "성장", where: "성장 목록 위" },
      { key: "parent.monthly", label: "월간리포트", where: "리포트 위" },
      { key: "parent.calendar", label: "달력", where: "달력 위" },
      { key: "parent.books", label: "준비할 교재", where: "구매 목록 아래 안내" },
      { key: "parent.request", label: "보내기", where: "결석·보강 신청 칸 위" },
      { key: "parent.comments", label: "남기실 말씀", where: "질문 칸 위" },
    ],
  },
  {
    key: "menu",
    label: "선생님 메뉴",
    hint: "묶음 화면(일정 · 학습 · 성장 · 관리자)을 열었을 때 맨 위에 뜹니다. 조교·강사에게 하는 말을 적어두시면 됩니다.",
    /**
     * 대메뉴가 다섯이 되었다 (원장님 확정, 2026-08-28). 「대시보드」 는 여기
     * 없다 — 그 이름을 누르면 묶음 화면이 아니라 대시보드로 바로 가기 때문에
     * 적어둘 자리가 없다 (대시보드에 하실 말씀은 화면 안내 쪽에 있다).
     * 옛 자리(menu.today · menu.students · menu.send · menu.manage)에 적어두신
     * 것은 지우지 않는다 — 표에 그대로 남고, 읽는 화면만 없어진다.
     */
    spots: [
      { key: "menu.calendar", label: "일정", where: "일정 묶음 화면" },
      { key: "menu.books", label: "학습", where: "학습 묶음 화면" },
      { key: "menu.growth", label: "성장", where: "성장 묶음 화면" },
      { key: "menu.settings", label: "관리자", where: "관리자 묶음 화면" },
    ],
  },
];

/** 한 줄 목록 — 설정 화면이 저장할 때 쓴다 */
export const NOTE_KEYS = NOTE_GROUPS.flatMap((g) => g.spots.map((s) => s.key));

/**
 * 적어둔 문구를 읽어온다.
 *
 * **표가 없어도 화면은 그대로 열려야 한다** (SQL 이 밀려 있을 수 있다).
 * 그때는 빈 Map 이 나오고, 화면은 원래 문구를 쓴다.
 */
export async function loadNotes(supabase) {
  const { data, error } = await supabase.from("screen_notes").select("key, body");
  if (error) return new Map();
  return new Map((data || []).filter((r) => (r.body || "").trim()).map((r) => [r.key, r.body.trim()]));
}

/** 이 자리에 적어둔 것이 있으면 그것, 없으면 원래 문구 */
export function noteOr(notes, key, fallback = "") {
  const v = notes?.get?.(key);
  return v && v.trim() ? v.trim() : fallback;
}
