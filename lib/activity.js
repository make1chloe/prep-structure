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
  // **아이가 부르는 자리.** 손 들고 기다리거나 말로 끼어드는 대신 이걸 누른다.
  // 선생님 현황판에서는 제일 앞으로 올라온다 — 지금 가보셔야 한다는 뜻이다.
  { key: "help", label: "도움이 필요해요", short: "도움", cls: "tag-red", call: true },
];

/**
 * **학생이 자기 화면에서 고를 수 있는 것.**
 *
 * 「채점 중」 은 선생님이 하는 일이라 뺀다. 아이가 고를 수 있는 것은
 * 자기가 지금 하고 있는 것과, 부르는 것뿐이다.
 */
export const STUDENT_PICKABLE = ["solving", "test", "done", "help", "break"];

/** 고를 수 있는 것 — 「—」 는 지우는 자리라 따로 낸다 */
export const PICKABLE = STATES.filter((s) => s.key !== "idle");

export function stateOf(key) {
  return STATES.find((s) => s.key === key) || STATES[0];
}

/**
 * **말 걸어도 되나.**
 *
 * 시험·채점·문제 풀이·설명 중이면 끼어들면 안 된다. 쉬는 중이거나 끝났으면
 * 지금이 말할 때다. 이 판단을 화면마다 다시 쓰면 어느 화면은 시험 중에도
 * 초록불이 뜨게 된다.
 */
export function canTalk(key) {
  return !stateOf(key).busy;
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

/**
 * **너무 오래된 상태는 흐리게.**
 *
 * 「시험 중」 으로 바꿔놓고 안 바꾼 채 수업이 끝나는 일이 반드시 생긴다.
 * 그걸 그대로 믿고 말을 안 걸면 더 나쁘다. 40분이 넘으면 흐리게 보여주고
 * 「오래됨」 을 붙인다 — 지우지는 않는다. 지우면 왜 사라졌는지 알 수 없다.
 */
export function isStale(iso, minutes = 40, now = Date.now()) {
  if (!iso) return false;
  return now - Date.parse(iso) > minutes * 60000;
}
