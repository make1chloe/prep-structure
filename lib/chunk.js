/**
 * **분량 쪼개기** — 한 번에 내기엔 많고, 단원이 잘게 안 쪼개져 있을 때
 * 「어느 단원 몇 쪽」을 병기해 나눠 낸다. (원장님 2026-09-02)
 *
 * 왜 필요한가 — 워크북은 **대단원 전체를 한 번에** 낸다(0062). 그런데 실측하면
 * 한 대단원 워크북이 **최대 18쪽**이다(그래머인사이드3 Chapter 04 · p.35~52).
 * 통째로 내면 아이가 못 한다. 그렇다고 소단원으로 쪼개면 원장님 방식과 달라진다.
 * → **쪽으로 자른다.** 「Unit 04 워크북 · p.35~40」
 *
 * ⚠️ 이 파일이 막는 사고 (계획 절 ⑳ · 자동 검사 ⑭)
 *    조각으로 낸 것에 ○ 을 주면 그 줄이 **완료**로 올라가고, 그게 그 유형의 마지막이면
 *    **대단원이 통째로 끝난 것으로 찍혀 커서가 다음 대단원으로 넘어간다.**
 *    안 낸 나머지는 배정 후보에서 사라져 다시 안 나온다 — 몇 달 뒤 그 단원만 구멍인 채 교재가 끝난다.
 *    → 다 안 덮었으면 ○ 을 줘도 **「하는 중 ◐」까지만** 올라가고 분모에 그대로 남는다.
 *    → 조각들이 원본을 **다 덮는 순간 저절로 ○** 이 된다. 원장님이 돌아와서 다시 안 찍는다.
 */

/** 쪽 범위 하나. 끝이 없으면 시작과 같다 (한 쪽짜리) */
const span = (u) => {
  const a = u.pageStart ?? u.page_start;
  const b = u.pageEnd ?? u.page_end ?? a;
  return a == null ? null : [Number(a), Number(b)];
};

/** 쪽 수 — 시작과 끝을 **둘 다 센다** (p.35~40 은 5쪽이 아니라 6쪽) */
export const pageCount = (u) => { const s = span(u); return s ? s[1] - s[0] + 1 : 0; };

/** 여러 줄을 한 덩어리로 — 워크북은 대단원 통째이므로 줄이 여럿이어도 한 덩어리다 */
export function lumpOf(units = []) {
  const ok = units.map(span).filter(Boolean);
  if (!ok.length) return null;
  return { from: Math.min(...ok.map((s) => s[0])), to: Math.max(...ok.map((s) => s[1])) };
}

/** 이미 낸 조각들을 쪽 목록으로 편다 */
function donePages(parts = []) {
  const set = new Set();
  for (const p of parts) {
    const a = p.pageFrom ?? p.page_from, b = p.pageTo ?? p.page_to ?? a;
    if (a == null) continue;
    for (let i = Number(a); i <= Number(b); i++) set.add(i);
  }
  return set;
}

/** 아직 안 낸 쪽 — 이어지는 것끼리 묶어 돌려준다 [[48,52],[60,61]] */
export function leftPages(units = [], parts = []) {
  const lump = lumpOf(units);
  if (!lump) return [];
  const done = donePages(parts), out = [];
  let run = null;
  for (let i = lump.from; i <= lump.to; i++) {
    if (done.has(i)) { if (run) { out.push(run); run = null; } continue; }
    if (run) run[1] = i; else run = [i, i];
  }
  if (run) out.push(run);
  return out;
}

/**
 * ⚠️ **다 덮었나.** 이 한 줄이 「완료로 올릴까 ◐ 로 둘까」를 가른다.
 *    쪽을 모르는 줄이 하나라도 있으면 **모른다고 답한다** — 「덮었다」고 지어내지 않는다(대전제 0).
 */
export function coveredBy(units = [], parts = []) {
  if (!units.length) return { covered: false, why: "낼 줄이 없다" };
  if (units.some((u) => span(u) == null))
    return { covered: null, why: "⚠️ 쪽수를 모르는 줄이 있다 — 원장님이 「이걸로 끝」을 눌러야 한다" };
  const left = leftPages(units, parts);
  return left.length
    ? { covered: false, why: `남은 쪽 ${left.map(([a, b]) => a === b ? `p.${a}` : `p.${a}~${b}`).join(" · ")}`, left }
    : { covered: true, why: "다 덮었다 — 진도가 저절로 올라간다", left: [] };
}

/**
 * **이번에 얼마를 낼까.** 남은 쪽에서 앞에서부터 `pages` 쪽만 떼어 준다.
 * ⚠️ 원장님이 정하는 것은 **분량(쪽)** 이지 항목 수가 아니다(절 ㊹).
 *    같은 「3개」가 교재마다 6문항에서 178문항까지 가므로 화면에도 **쪽·문항**을 띄운다.
 */
export function chunkPlan(units = [], { pages, parts = [] } = {}) {
  const left = leftPages(units, parts);
  const total = left.reduce((s, [a, b]) => s + (b - a + 1), 0);
  if (!total) return { give: [], pages: 0, leftAfter: [], done: true,
                       label: "남은 것이 없다 — 다 냈다" };

  // 안 정하면 남은 것 전부 (통째로 내는 것이 기본이다)
  const want = pages == null ? total : Math.max(1, Math.min(Number(pages), total));
  const give = [];
  let need = want;
  for (const [a, b] of left) {
    if (need <= 0) break;
    const take = Math.min(need, b - a + 1);
    give.push([a, a + take - 1]);
    need -= take;
  }
  const after = leftPages(units, [...parts, ...give.map(([a, b]) => ({ pageFrom: a, pageTo: b }))]);
  return {
    give, pages: want, leftAfter: after, done: after.length === 0,
    label: rangeLabel(units, give),
    // ⚠️ 다음에 이 줄이 또 나올 때 **지난번 범위를 같이 띄운다** (계획 「지난번 p.31-34까지 냈습니다」)
    leftLabel: after.length
      ? `남은 것 ${after.map(([a, b]) => a === b ? `p.${a}` : `p.${a}~${b}`).join(" · ")}`
      : "이걸로 끝",
  };
}

/** 화면과 아이에게 그대로 나가는 글 — 「Unit 04 부정사 · 워크북 · p.35~40」 */
export function rangeLabel(units = [], ranges = []) {
  const u = units[0] ?? {};
  const head = [u.chapter, u.isWorkbook ?? u.is_workbook ? "워크북" : (u.sub || u.activity)]
    .filter(Boolean).join(" · ");
  if (!ranges.length) return head;
  return `${head} · ${ranges.map(([a, b]) => a === b ? `p.${a}` : `p.${a}~${b}`).join(", ")}`;
}

/**
 * ⚠️ **진도를 어디까지 올릴까.** 검사에서 ○ 을 받아도 이 함수를 지나야 한다.
 *    `done`  — 다 덮었다. 완료로 올린다
 *    `doing` — 조각만 냈다. **◐ 에서 멈추고 분모에 남는다**
 *    `ask`   — 쪽수를 몰라 앱이 못 정한다. 원장님이 「이걸로 끝」을 누른다
 */
export function statusFor(mark, units = [], parts = []) {
  if (mark === "missing" || mark === "weak") return { status: mark === "weak" ? "doing" : "none", auto: false };
  if (mark !== "done") return { status: "none", auto: false };
  const c = coveredBy(units, parts);
  if (c.covered === null) return { status: "doing", auto: false, ask: true, why: c.why };
  return c.covered
    ? { status: "done", auto: true, why: c.why }
    : { status: "doing", auto: true, why: c.why };
}
