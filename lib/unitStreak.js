/**
 * **단원평가 흐름** — 통과했나, 몇 번 만에 통과했나, 지금 어디 막혀 있나.
 *
 * ── 왜 만들었나 (2026-08-06, 한 달 살아보기에서) ─────────
 *
 * 9월 한 달을 돌려봤더니 **단원평가가 66건 쌓이고 그중 12건이 재시험**이었다.
 * 그런데 그 12건이 어느 화면에도 안 모인다 —
 *
 *   · 성적 화면에는 66줄이 날짜순으로 늘어서 있고
 *   · 학생·학부모 성장 카드는 모의고사·내신만 그린다
 *   · 그래서 **「이 아이가 관계사에서 세 번째 막혔다」 를 아무도 모른다**
 *
 * 원장님이 단원평가에서 보시는 것은 점수가 아니라 **몇 번 만에 통과했나**
 * 다 (원장님, 2026-08-06). 실제 노션 자료에서도 왕희연이 「문장의 형식」 을
 * 다섯 번 봤다. 그 다섯 번이 한 줄로 보여야 한다.
 *
 * 여기에는 **계산만** 둔다.
 */

/** 통과했나 — 「통과」 라고 적혀 있으면 통과다 (오늘 수업이 그렇게 적는다) */
function isPass(score = {}) {
  const note = (score.note || "").trim();
  if (note.includes("재시험")) return false;
  if (note.includes("통과")) return true;
  // 적어둔 것이 없으면 점수로 본다 (옛 자료 · 손으로 넣은 것)
  const raw = Number(score.raw_score);
  const full = Number(score.full_score) || 100;
  if (!Number.isFinite(raw) || full <= 0) return null;
  return raw / full >= 0.8;
}

/**
 * 단원평가 줄들 → **단원별 한 줄**.
 *
 * 같은 단원을 여러 번 본 것은 **중복이 아니라 기록**이다. 몇 번 만에
 * 통과했는지가 그 아이를 말해준다.
 *
 * @param scores  kind='unit' 인 scores (차례 상관없음)
 * @returns [{ unit, tries, passed, passedOn, lastOn, best, last }] 최근 것부터
 */
function byUnit(scores = []) {
  const bag = new Map();
  [...scores]
    .filter((s) => s?.kind === "unit" && (s.term || "").trim())
    .sort((a, b) => (a.taken_on || "").localeCompare(b.taken_on || ""))
    .forEach((s) => {
      const key = s.term.trim();
      if (!bag.has(key)) bag.set(key, { unit: key, tries: 0, passed: false, passedOn: null, lastOn: null, best: null, last: null });
      const u = bag.get(key);
      u.tries += 1;
      u.lastOn = s.taken_on || u.lastOn;
      const pct = Number(s.raw_score);
      if (Number.isFinite(pct)) {
        u.last = pct;
        u.best = u.best == null ? pct : Math.max(u.best, pct);
      }
      // **통과한 뒤에 또 봤어도 통과는 통과다** — 되돌리지 않는다
      if (!u.passed && isPass(s) === true) { u.passed = true; u.passedOn = s.taken_on || null; }
    });
  return [...bag.values()].sort((a, b) => (b.lastOn || "").localeCompare(a.lastOn || ""));
}

/**
 * 한 아이의 단원평가 한눈에.
 *
 * @returns {
 *   units,        단원별 줄
 *   total,        본 단원 수
 *   passed,       통과한 단원 수
 *   tries,        총 응시 횟수
 *   retests,      재시험 횟수 (응시 - 단원 수)
 *   stuck,        **아직 못 넘은 단원** (두 번 이상 봤는데 통과 못 함)
 *   now,          지금 붙들고 있는 단원 (제일 최근에 못 넘은 것)
 * }
 */
export function unitProgress(scores = []) {
  const units = byUnit(scores);
  const tries = units.reduce((a, u) => a + u.tries, 0);
  const passed = units.filter((u) => u.passed).length;
  // **두 번 이상 봤는데 아직 못 넘은 것.** 한 번 보고 못 넘은 것은 아직
  // 「막혔다」 가 아니다 — 다음 시간에 다시 보면 되는 일이다
  const stuck = units.filter((u) => !u.passed && u.tries >= 2);
  return {
    units,
    total: units.length,
    passed,
    tries,
    retests: Math.max(0, tries - units.length),
    rate: units.length > 0 ? Math.round((passed / units.length) * 100) : null,
    stuck,
    now: units.find((u) => !u.passed) || null,
  };
}

/**
 * **몇 번을 다시 보면 알려드릴까.**
 *
 * 두 번은 흔하다 (한 번 미끄러지고 다음에 통과). **세 번째부터**가
 * 「이 단원은 설명을 다시 해야 한다」 는 신호다. 두 번에 알리면 경고가
 * 흔해져서 정작 세 번째에 안 들린다 — 결석 한마디를 두 번부터 붙인 것과
 * 같은 이유다 (`lib/monthly` 의 ABSENCE_NOTE_AT).
 */
export const RETEST_WARN_AT = 3;

/**
 * 반 전체에서 **같은 단원에 막힌 아이들**을 찾는다.
 *
 * 한 아이가 못 넘는 것은 그 아이 일이지만, **셋이 같은 단원에서 막혔으면
 * 우리가 그 단원을 잘못 가르친 것**이다 (출제분석과 같은 생각).
 *
 * @param byStudent  [{ student, scores }]
 * @returns { people, units }
 */
export function stuckAcross(byStudent = []) {
  const people = [];
  const unitBag = new Map();

  byStudent.forEach(({ student, scores }) => {
    const p = unitProgress(scores);
    p.stuck.forEach((u) => {
      if (u.tries >= RETEST_WARN_AT) {
        people.push({ student, unit: u.unit, tries: u.tries, last: u.last });
      }
      if (!unitBag.has(u.unit)) unitBag.set(u.unit, []);
      unitBag.get(u.unit).push(student?.name || "");
    });
  });

  const units = [...unitBag.entries()]
    .map(([unit, names]) => ({ unit, names, n: names.length }))
    .filter((x) => x.n >= 3)
    .sort((a, b) => b.n - a.n);

  return { people: people.sort((a, b) => b.tries - a.tries), units };
}

