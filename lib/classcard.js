/**
 * **클래스카드 판정 한 벌** (확정 ⑱ · 원장님 답 3).
 *
 * 확장(`classcard-extension/background.js`)이 플래너에서 긁어 `v2.cc_planner` 에 넣는다.
 * 그 파일 주석이 판정을 여기로 미룬다 — 「판정·문구는 앱 lib 한 곳이 한다」.
 *
 * ── 확장이 **실제로** 보내는 것 (2026-09-02 실물 확인, background.js:55~92)
 *    · `goals` / `got` — **`goal_yn=1` 로 켠 모드만** `{mem, recall, spell, speaking, match}`
 *    · `complete`(그 세트를 끝냈나) · `status`(learn_status 숫자) · `cards` · `type`(1 단어·2 문장)
 *
 * ── ⚠️⚠️ **안 켠 모드를 「0점이라 미달」로 읽지 않는다.**
 *    확장은 켠 모드만 담는다. 안 담긴 모드는 **원장님이 목표를 안 건 것**이지 아이가 못 한 것이 아니다.
 *    다섯 모드를 다 훑으면 늘 「3~4개 미달」이 떠서 **판정이 그날로 쓸모없어진다.**
 *
 * ── ⚠️ **못 하는 것을 하는 척하지 않는다** (대전제 0)
 *    · **3초훈련** — 아이 눈이 한 단어에 몇 초 머무는지는 **아무도 못 본다.** 판정 안 한다.
 *    · **스크램블** — 확장이 읽는 다섯에 없다. 클래스카드가 안 주는지 확장이 안 읽는지 **모른다.**
 *    · `status` 숫자가 무엇을 뜻하는지 **모른다** — 그래서 판정에 안 쓴다. 그대로 넘겨 화면이 띄운다.
 *
 * ── ⚠️ **미달이라고 앱이 넘기지 않는다** (원장님 2026-09-01 — 「매번 내가 넘기기를 누른다」).
 *    여기는 **판정만** 한다. 넘기는 것은 원장님이 누르는 자리다.
 */

/** 확장이 읽는 다섯 모드 — **이 목록은 확장과 짝이다.** 늘리려면 확장을 먼저 고친다 */
export const MODES = Object.freeze(["mem", "recall", "spell", "speaking", "match"]);

/** 화면에 뜨는 이름. ⚠️ 화면이 이 표를 다시 적지 않는다(원칙 1) */
export const MODE_NAME = Object.freeze({
  mem: "암기", recall: "리콜", spell: "스펠", speaking: "스피킹", match: "매칭",
});

/** 세트 갈래 — 확장이 글자로 준다(`set_type`) */
export const SET_TYPE = Object.freeze({ "1": "단어", "2": "문장" });
export const setTypeName = (t) => SET_TYPE[String(t ?? "")] ?? "모름";

const 수 = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * 세트 하나를 판정한다.
 *
 * @param set { goals, got, complete, status, cards, set_name, set_type }
 * @returns {
 *   state: 'met' | 'short' | 'undone' | 'nogoal',
 *   short: [{ mode, name, goal, got, gap }],   // 모자란 모드만
 *   judged: [모드…],                            // 실제로 판정한 모드
 *   why: 사람 말 한 줄,
 * }
 *
 * 갈래 넷 —
 *   · `nogoal` 목표를 하나도 안 걸었다 → **미달이 아니다.** 판정할 것이 없다
 *   · `undone` 아직 끝내지 않았다 → 미달과 다르다. 「안 했다」이지 「못 했다」가 아니다
 *   · `short`  켠 모드 중 하나라도 목표에 못 미쳤다
 *   · `met`    켠 모드를 다 넘겼다
 */
export function judgeSet(set = {}) {
  const goals = set.goals && typeof set.goals === "object" ? set.goals : {};
  const got = set.got && typeof set.got === "object" ? set.got : {};

  // ⚠️ **켠 모드만** 본다. MODES 를 다 훑으면 안 켠 것이 전부 미달로 뜬다
  const judged = MODES.filter((m) => 수(goals[m]) !== null);

  if (!judged.length)
    return { state: "nogoal", short: [], judged: [], why: "목표를 안 걸었습니다 — 판정할 것이 없습니다" };

  if (set.complete === false)
    return { state: "undone", short: [], judged,
             why: "아직 안 끝냈습니다 — 목표 미달과 다릅니다" };

  const short = judged
    .map((m) => ({ mode: m, name: MODE_NAME[m] ?? m, goal: 수(goals[m]), got: 수(got[m]) ?? 0 }))
    .filter((x) => x.got < x.goal)
    .map((x) => ({ ...x, gap: x.goal - x.got }));

  if (!short.length)
    return { state: "met", short: [], judged,
             why: `목표를 다 넘겼습니다 (${judged.map((m) => MODE_NAME[m]).join("·")})` };

  return { state: "short", short, judged,
           why: short.map((x) => `${x.name} ${x.got}/${x.goal} (${x.gap} 모자람)`).join(" · ") };
}

/**
 * 그 아이 그날 세트들을 한 줄로 — 화면이 「목표 미달 n개」를 띄우는 자리.
 * ⚠️ **세는 것만 한다.** 저장하지 않는다(원칙 5).
 */
export function judgeDay(sets = []) {
  const list = (Array.isArray(sets) ? sets : []).map((s) => ({ ...s, judge: judgeSet(s) }));
  const n = (st) => list.filter((x) => x.judge.state === st).length;
  return {
    sets: list,
    met: n("met"), short: n("short"), undone: n("undone"), nogoal: n("nogoal"),
    // ⚠️ 「넘기기」는 원장님이 누른다 — 앱이 자동으로 안 넘긴다(원장님 2026-09-01)
    needsCall: n("short") > 0 || n("undone") > 0,
  };
}

/**
 * 앱이 **판정 못 하는 것**. 화면이 이 목록을 그대로 띄워 「검증하는 척」을 막는다(대전제 0).
 * ⚠️ 여기 적힌 것을 통과 기준으로 쓰지 않는다.
 */
export const CANNOT_JUDGE = Object.freeze([
  { what: "3초훈련", why: "한 단어에 눈이 몇 초 머무는지는 클래스카드도 앱도 모릅니다 — 아이 스스로 보는 것입니다" },
  { what: "스크램블", why: "확장이 읽는 다섯 모드에 없습니다. 클래스카드가 안 주는지 확장이 안 읽는지 **확인 안 됨**" },
  { what: "드릴", why: "세트 갈래가 1·2 뿐이라 드릴이 무엇으로 오는지 **확인 안 됨** — 실제로 내주시는 날 알 수 있습니다" },
]);
