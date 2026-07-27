// 단어시험 방식 — 학생마다 · 교재마다 · 회독마다 다르다
//
// 네 가지가 합쳐서 100%가 되게 배분한다. 0인 것은 안 본다는 뜻이다.
// 라벨은 **0인 것을 빼고** 짧게 만든다. 수업 중에 흘깃 보고 알아야 하기 때문이다.

export const TYPES = [
  { key: "mc_meaning", label: "객관식 뜻", short: "객뜻" },
  { key: "sa_meaning", label: "주관식 뜻", short: "주뜻" },
  { key: "mc_word", label: "객관식 영단어", short: "객단" },
  { key: "sa_word", label: "주관식 영단어", short: "주단" },
];

/** 배분 합계 */
export function total(cfg = {}) {
  return TYPES.reduce((s, t) => s + (Number(cfg[t.key]) || 0), 0);
}

/**
 * 짧은 라벨 — 오늘 수업 진도 옆에 붙는다.
 *   "2회독 · 주뜻50 주단50(첫글자)"
 *   "1회독 · 객뜻100"
 * 설정이 없으면 null (화면에서 "시험 방식 미설정" 으로 알린다)
 */
export function label(cfg) {
  if (!cfg) return null;
  const parts = TYPES.filter((t) => (Number(cfg[t.key]) || 0) > 0).map(
    (t) => `${t.short}${cfg[t.key]}`
  );
  if (parts.length === 0) return `${cfg.round || 1}회독 · 배분 미입력`;
  const hint = cfg.first_hint && (Number(cfg.sa_word) || 0) > 0 ? "(첫글자)" : "";
  return `${cfg.round || 1}회독 · ${parts.join(" ")}${hint}`;
}

/** 풀어 쓴 설명 — 학생용 페이지·안내에 쓴다 */
export function describe(cfg) {
  if (!cfg) return "";
  const parts = TYPES.filter((t) => (Number(cfg[t.key]) || 0) > 0).map((t) => {
    const extra =
      t.key === "sa_word" && cfg.first_hint ? " (첫 글자 힌트 있음)" : "";
    return `${t.label} ${cfg[t.key]}%${extra}`;
  });
  return parts.join(" · ");
}

/**
 * 점수 한 줄. **틀린 개수**로 적는다.
 * 채점할 때 세는 것이 틀린 개수이고, 통과선도 오답률이라 그쪽이 눈에 바로 들어온다.
 *   score(18, 20) → "2/20 틀림"
 *   score(20, 20) → "다 맞음 (20개)"
 */
export function score(correct, totalCount) {
  if (!totalCount) return "";
  const wrong = Math.max(0, totalCount - (correct ?? 0));
  return wrong === 0 ? `다 맞음 (${totalCount}개)` : `${wrong}/${totalCount} 틀림`;
}

/**
 * 오답률로 통과를 본다.
 * 원장님 규칙: **오답 10% 이내면 통과.** (맞은 비율이 아니라 틀린 비율)
 */
export function passed(correct, totalCount, wrongPct = 10) {
  if (!totalCount) return null;                 // 시험을 안 봤다
  const wrong = Math.max(0, totalCount - (correct ?? 0));
  return (wrong / totalCount) * 100 <= wrongPct;
}
