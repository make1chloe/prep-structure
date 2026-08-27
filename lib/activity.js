// 지금 이 아이가 뭘 하고 있나
//
// 원장님 (2026-08-05) — 「시험 볼 때 얘기하려고 했더니, 다른 학생 설명 중일 때
// 끼어들어서 말해」. 한 반에 여럿이 각자 다른 것을 하고 있어서, 지금 누가
// 시험 중인지 눈으로 세고 있어야 한다.
//
// 상태는 **여기 한 곳**에만 적는다. DB 는 글자로 받는다 — 하나 늘릴 때마다
// SQL 을 돌리게 하면 안 된다.

export const STATES = [
  { key: "idle", label: "—", short: "", cls: "tag-muted", quiet: true },
  { key: "test", label: "시험 중", short: "시험", cls: "tag-red", busy: true },
  { key: "grading", label: "채점 중", short: "채점", cls: "tag-amber", busy: true },
  { key: "solving", label: "문제 푸는 중", short: "문제", cls: "tag-sky", busy: true },
  { key: "lesson", label: "설명 듣는 중", short: "설명", cls: "tag-lav", busy: true },
  { key: "break", label: "쉬는 중", short: "쉼", cls: "tag-mint" },
  { key: "done", label: "끝", short: "끝", cls: "tag-mint" },
  /**
   * **아이가 부르는 자리** — 세 갈래로 나눈다 (원장님, 2026-08-07).
   *
   * 「도움이 필요해요」 하나로는 **가보기 전까지 무슨 일인지 모른다.**
   * 채점이 틀렸다는 것과 문제를 모르겠다는 것은 들고 갈 것도 다르고
   * 급한 정도도 다르다. 눌러주는 아이 입장에서도 「도움」 은 부담스러운
   * 말이라 잘 안 누른다 — 「질문이 있어요」 는 누른다.
   *
   * 셋 다 call 이다 (현황판 맨 위로 올라간다). 그래야 나누는 뜻이 있다.
   */
  { key: "ask", label: "질문이 있어요", short: "질문", cls: "tag-red", call: true },
  { key: "bug", label: "오류가 있어요", short: "오류", cls: "tag-red", call: true },
  { key: "help", label: "기타 도움이 필요해요", short: "도움", cls: "tag-red", call: true },
];

/**
 * **학생이 자기 화면에서 누르는 것 — 딱 두 개.**
 *
 * 「문제 푸는 중」 「다 했어요」 는 **이미 누르고 있다.** 학습을 시작하면
 * 타이머가 돌고, 끝내면 「다 했어요」 를 누른다. 그게 그대로 현황판에 뜬다.
 * 여기에 같은 것을 또 두면 두 군데가 되고, 두 군데는 반드시 어긋난다.
 *
 * 그래서 여기 남는 것은 **기존 자리에 없는 것**뿐이다 —
 * 부르는 것과, 잠깐 자리를 비우는 것.
 */
export const STUDENT_PICKABLE = ["ask", "bug", "help", "break"];

export function stateOf(key) {
  return STATES.find((s) => s.key === key) || STATES[0];
}

/** 지금 가봐야 하나 — 아이가 부른 것 */
export function isCalling(key) {
  return !!stateOf(key).call;
}

/** 「3분 전」 — 오래된 상태는 믿을 것이 못 된다는 뜻이기도 하다 */
export function agoLabel(iso, now = Date.now()) {
  if (!iso) return "";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "방금";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  return `${h}시간 전`;
}

