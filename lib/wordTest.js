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
 * 점수는 앱 전체에서 **성취도 %** 하나로 말한다.
 *
 * 단어시험도, 단원평가도, 숙제 성취도도, 월간리포트도 같은 방향이다 —
 * **높을수록 좋다.** 어떤 줄은 높아야 좋고 어떤 줄은 낮아야 좋으면
 * 읽는 사람이 매번 뒤집어 생각해야 한다.
 */
export function pct(correct, totalCount) {
  if (!totalCount) return null;
  return Math.round(((correct ?? 0) / totalCount) * 100);
}

/**
 * 점수 한 줄.
 *   score(18, 20) → "90% (2개 틀림)"
 *   score(20, 20) → "100% (다 맞음)"
 * 채점은 틀린 개수로 하니 괄호에 그대로 남겨둔다.
 */
export function score(correct, totalCount) {
  if (!totalCount) return "";
  const wrong = Math.max(0, totalCount - (correct ?? 0));
  return `${pct(correct, totalCount)}% (${wrong === 0 ? "다 맞음" : `${wrong}개 틀림`})`;
}

/**
 * 단원평가 점수 — **"90점 (-2/20문제)"** (원장님이 쓰시는 모양, 2026-08-05).
 *
 * 점수가 앞이다. 괄호 안은 **몇 문제 틀렸나 / 몇 문제짜리인가** 다.
 * 맞은 개수가 아니라 **틀린 개수에 마이너스를 붙인다** — 채점은 틀린 것을
 * 세면서 하고, 「-2」 는 눈으로 바로 읽히지만 「18」 은 20에서 빼봐야 안다.
 */
export function scoreRaw(correct, totalCount) {
  const t = Number(totalCount);
  if (!Number.isFinite(t) || t <= 0) return "";
  // **안 적은 것과 0점은 다르다.** Number(null) 은 0 이라, 그냥 넘기면
  // 점수를 안 적은 시험이 「0점 (-20/20문제)」 로 나간다 — 월간리포트에 그대로.
  if (correct === null || correct === undefined || correct === "") return `?점 (${t}문제)`;
  const c = Number(correct);
  if (!Number.isFinite(c)) return `?점 (${t}문제)`;
  const wrong = Math.max(0, t - c);
  if (wrong === 0) return `${pct(c, t)}점 (${t}문제 다 맞음)`;
  return `${pct(c, t)}점 (-${wrong}/${t}문제)`;
}

/**
 * 통과선도 성취도 기준이다. **90% 이상이면 통과.**
 * (원장님이 쓰시던 "오답 10% 이내" 와 같은 뜻이다)
 */
export function passed(correct, totalCount, passPct = 90) {
  if (!totalCount) return null;                 // 시험을 안 봤다
  return pct(correct, totalCount) >= passPct;
}

/**
 * 이 학생의 통과선은 몇 %인가.
 *
 * 원장님은 「오답 10% 이내」로 말씀하신다. 학생마다 다르게 두는 경우가 있어서
 * 재원생 화면에서 word_cut_pct 로 따로 적어둘 수 있다 (0070). 안 적었으면
 * 설정의 기본값을 쓴다.
 */
export function cutOf(student, defaultPass = 90) {
  const v = Number(student?.word_cut_pct);
  return Number.isFinite(v) && v > 0 && v <= 100 ? v : defaultPass;
}

/**
 * 오늘 시험은 **몇 개짜리인가.**
 *   1) 재원생에 적어둔 개수 (word_test_count) 가 있으면 그것
 *   2) 없으면 그날 범위 단원들의 단어 개수를 더한 것
 *   3) 그것도 없으면 지난번 본 개수
 * 셋 다 없으면 null — 화면에서 손으로 적는다.
 *
 * @param units 오늘 범위 단원 [{ word_count }]
 */
export function plannedTotal(student, units = [], lastTotal = null) {
  const fixed = Number(student?.word_test_count);
  if (Number.isFinite(fixed) && fixed > 0) return fixed;
  const sum = (units || []).reduce((s, u) => s + (Number(u?.word_count) || 0), 0);
  if (sum > 0) return sum;
  const last = Number(lastTotal);
  return Number.isFinite(last) && last > 0 ? last : null;
}

/**
 * 통과·미통과를 **자동으로 판정한다.**
 *
 * 따로 저장하지 않는다. 점수(맞은 개수·전체)와 그 학생의 통과선만 있으면
 * 언제든 다시 계산되기 때문이다. 저장해두면 통과선을 고쳤을 때 지난 기록이
 * 옛 기준으로 남아, 같은 점수가 화면마다 다르게 보이게 된다.
 *
 * @returns null (시험 안 봄) | { pct, wrong, allowed, pass, label }
 */
export function verdict(correct, totalCount, cut = 90) {
  const t = Number(totalCount);
  const c = Number(correct);
  if (!Number.isFinite(t) || t <= 0) return null;
  if (!Number.isFinite(c)) return null;
  const p = pct(c, t);
  const wrong = Math.max(0, t - c);
  // 「몇 개까지 틀려도 통과인가」 — 채점하면서 바로 쓰는 숫자다
  const allowed = Math.floor((t * (100 - cut)) / 100);
  const pass = p >= cut;
  return { pct: p, wrong, allowed, pass, label: pass ? "통과" : "미통과" };
}

/** 여러 번 본 것을 세어 준다 — 월간·학부모 화면의 "n번 중 m번 통과" */
export function passCount(rows = [], cut = 90) {
  let took = 0;
  let ok = 0;
  for (const r of rows) {
    const v = verdict(r?.word_correct, r?.word_total, cut);
    if (!v) continue;
    took += 1;
    if (v.pass) ok += 1;
  }
  return { took, ok };
}

/**
 * **몇 번째에 통과했나.**
 *
 * 원장님 규칙 (2026-08-05)
 *   1번에 통과      → 「통과」
 *   재시험에서 통과 → 「재시험 통과」
 *   그 뒤          → 「3차 통과」 처럼 횟수를 붙인다
 *
 * 못 하면 다시 본다. 그러니 「몇 번 통과」 만 세면 같은 90점이 한 번에 받은
 * 90점인지 세 번 만에 받은 90점인지 구별이 안 된다. **몇 번째였는지가 정보다.**
 *
 * 통과하면 거기서 한 묶음이 끝나고 다음 시험은 다시 1차부터다.
 *
 * @param rows 날짜 **오름차순**. { word_correct, word_total, date }
 */
export function attempts(rows = [], cut = 90) {
  let n = 0;
  return (rows || []).map((r) => {
    const v = verdict(r?.word_correct, r?.word_total, cut);
    if (!v) return { ...r, verdict: null, attempt: null, label: "" };
    n += 1;
    const label = !v.pass
      ? "미통과"
      : n === 1
      ? "통과"
      : n === 2
      ? "재시험 통과"
      : `${n}차 통과`;
    const out = { ...r, verdict: v, attempt: n, label };
    if (v.pass) n = 0;              // 통과하면 다음은 다시 1차
    return out;
  });
}

/**
 * 한 달 요약 — 「6번 중 4번 통과 (그중 재시험 1번)」.
 *
 * 재시험에서 통과한 것도 **통과는 통과다.** 다만 한 번에 통과한 것과 구별해서
 * 적는다. 학부모님께 "재시험까지 해서 통과했다" 는 것은 숨길 일이 아니고,
 * 오히려 그게 그 달의 실제 모습이다.
 */
export function passSummary(rows = [], cut = 90) {
  const list = attempts(rows, cut);
  let took = 0;
  let ok = 0;
  let first = 0;
  let retry = 0;
  for (const r of list) {
    if (!r.verdict) continue;
    took += 1;
    if (!r.verdict.pass) continue;
    ok += 1;
    if (r.attempt === 1) first += 1;
    else retry += 1;
  }
  return { took, ok, first, retry, list };
}
