/**
 * **출제분석** — 이번 시험은 어디서 나왔고, 우리 애들은 어디서 틀렸나.
 *
 * 원장님 (2026-08-06) — 「출제분석하는 페이지도 필요한데」
 *
 * 여기에는 **계산만** 둔다 (DB 도 화면도 안 탄다).
 *
 * ── 이 화면이 답하는 것은 둘이다 ─────────────────────────
 *
 * **1. 다음 시험에 무엇을 시킬까** — 출처 비중.
 *    교과서에서 60% 나오는 학교와 외부지문이 반인 학교는 시켜야 할 공부가
 *    아예 다르다. 그런데 그것은 **시험지를 봐야만** 알 수 있고, 시험이 끝나면
 *    시험지는 흩어진다. 한 번 적어두면 그 학교 대비가 매년 쌓인다.
 *
 * **2. 지금 무엇을 다시 볼까** — 우리 애들이 몰린 곳.
 *    한 아이가 5과를 틀린 것은 그 아이 일이지만, **다섯이 같이 틀렸으면
 *    우리가 안 가르친 것**이다. 그 둘을 가르는 것이 이 화면이다.
 *
 * ── 조심한 것 ────────────────────────────────────────────
 *
 * **응시자 수를 모르면 비율을 말하지 않는다.** 셋이 봤는데 둘이 틀린 것과
 * 열이 봤는데 둘이 틀린 것은 전혀 다른 이야기다. 그래서 늘 「n명 중 m명」
 * 으로 적고, 응시자가 셋 미만이면 「사람이 적어 아직 못 봅니다」 라고 한다 —
 * 두 명 가지고 「이 단원이 약합니다」 라고 하면 그다음부터 안 믿게 된다.
 */

/** 배열을 { key: [rows] } 로 */
function group(rows, keyOf) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyOf(r);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  return m;
}

const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * 시험지 하나를 뜯어본다.
 *
 * @param questions  exam_questions (그 회차)
 * @param scores     그 회차를 본 학생들의 scores
 * @param items      그 학생들의 score_items (틀린 것)
 * @param students   [{ id, name }]
 */
export function analyze(questions = [], scores = [], items = [], students = []) {
  const qs = [...questions]
    .filter((q) => Number.isFinite(Number(q?.no)))
    .sort((a, b) => a.no - b.no);

  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const studentOfScore = new Map(scores.map((s) => [s.id, s.student_id]));

  // 몇 명이 봤나 — **모든 셈의 바탕**이다
  const takers = [...new Set(scores.map((s) => s.student_id))];
  const n = takers.length;

  // 문항 번호 → 틀린 학생들
  const wrongBy = new Map();
  items.forEach((it) => {
    if (!it?.wrong) return;
    const sid = studentOfScore.get(it.score_id);
    const no = Number(it.no);
    if (!sid || !Number.isFinite(no)) return;
    if (!wrongBy.has(no)) wrongBy.set(no, new Set());
    wrongBy.get(no).add(sid);
  });

  const rows = qs.map((q) => {
    const who = [...(wrongBy.get(q.no) || [])];
    return {
      ...q,
      wrong: who.length,
      who: who.map((id) => nameOf.get(id) || "—"),
      rate: n > 0 ? pctOf(n - who.length, n) : null,   // 정답률
    };
  });

  // ── 출제 구성 ──────────────────────────────────────────
  //   배점이 적혀 있으면 **배점으로** 센다. 3점짜리 서술형 둘과 2점짜리
  //   객관식 둘은 시험에서 차지하는 무게가 다르다
  const totalPoints = qs.reduce((a, q) => a + (Number(q.points) || 0), 0);
  const share = (m) =>
    [...m.entries()]
      .map(([key, list]) => {
        const pts = list.reduce((a, q) => a + (Number(q.points) || 0), 0);
        return {
          key,
          count: list.length,
          points: pts || null,
          // 배점이 다 적혀 있을 때만 배점 비율을 쓴다. 반만 적혀 있으면 거짓말이 된다
          pct: totalPoints > 0 && pts > 0 ? pctOf(pts, totalPoints) : pctOf(list.length, qs.length),
          byPoints: totalPoints > 0 && pts > 0,
          nos: list.map((q) => q.no),
        };
      })
      .sort((a, b) => b.count - a.count);

  const bySource = share(group(qs, (q) => (q.source || "").trim() || null));
  const byUnit = share(group(qs, (q) => (q.unit || "").trim() || null));
  const byArea = share(group(qs, (q) => (q.area || q.topic || "").trim() || null));

  // ── 우리 애들이 몰린 곳 ────────────────────────────────
  //   단원마다 「몇 명이 몇 문항을 틀렸나」. 사람이 적으면 아예 안 센다
  const weakUnits = n >= 3
    ? [...group(rows, (r) => (r.unit || "").trim() || null).entries()]
        .map(([unit, list]) => {
          const wrongTotal = list.reduce((a, r) => a + r.wrong, 0);
          const chances = list.length * n;
          return {
            unit,
            questions: list.length,
            wrongTotal,
            // 그 단원 문항을 우리 애들이 푼 횟수 중 몇 %를 틀렸나
            wrongPct: pctOf(wrongTotal, chances),
            // 한 명이라도 틀린 문항 수
            touched: list.filter((r) => r.wrong > 0).length,
          };
        })
        .filter((x) => x.wrongTotal > 0)
        .sort((a, b) => b.wrongPct - a.wrongPct)
    : [];

  // **다 같이 틀린 문항** — 우리가 안 가르친 것일 가능성이 높다.
  // 절반 넘게 틀렸으면 그 문항은 아이 문제가 아니다
  const shared = n >= 3
    ? rows.filter((r) => r.wrong >= Math.ceil(n / 2)).sort((a, b) => b.wrong - a.wrong)
    : [];

  return {
    rows,
    n,
    takers,
    questionCount: qs.length,
    totalPoints: totalPoints || null,
    bySource,
    byUnit,
    byArea,
    weakUnits,
    shared,
    // 문항표를 안 적으셨으면 화면이 무엇을 해야 하는지 알아야 한다
    hasSpec: qs.length > 0,
    hasSource: qs.some((q) => (q.source || "").trim()),
    hasUnit: qs.some((q) => (q.unit || "").trim()),
  };
}

/**
 * **다음 대비 한 줄** — 숫자에서 나온 문장만.
 *
 * 「무엇을 시킬까」 까지 적어주지 않으면 표만 보고 닫으신다.
 */
export function advice(a, examName = "") {
  const out = [];
  const who = examName || "이 시험";

  if (a.hasSource && a.bySource.length > 0) {
    const top = a.bySource[0];
    const tail = a.bySource
      .slice(1, 3)
      .map((s) => `${s.key} ${s.pct}%`)
      .join(" · ");
    out.push({
      head: "출제 구성",
      body:
        `${who}는 **${top.key}에서 ${top.pct}%** 나왔습니다 (${top.count}문항` +
        `${top.byPoints ? ` · ${top.points}점` : ""}).` +
        (tail ? ` 그다음은 ${tail} 입니다.` : "") +
        (top.key === "교과서"
          ? " 교과서 본문·어휘를 통째로 보게 하는 것이 가장 빠릅니다."
          : top.key === "모의고사 변형"
          ? " 기출 지문을 변형해서 내는 학교입니다 — 해당 회차 지문을 미리 풀려두세요."
          : top.key === "외부지문"
          ? " 범위 밖에서 나오는 학교라, 교과서만 봐서는 안 됩니다."
          : ""),
    });
  }

  if (a.n < 3) {
    out.push({
      head: "우리 애들 결과",
      body:
        a.n === 0
          ? "아직 이 시험 성적이 없습니다. 아이들이 오답을 적어 내면 여기에 쌓입니다."
          : `이 시험을 본 아이가 ${a.n}명이라 아직 견줄 수 없습니다. 셋 이상 모이면 어디서 몰려 틀렸는지 보여드립니다.`,
    });
    return out;
  }

  if (a.shared.length > 0) {
    const s = a.shared[0];
    out.push({
      head: "다 같이 틀린 곳",
      body:
        `${a.n}명 중 ${s.wrong}명이 **${s.no}번**을 틀렸습니다` +
        `${s.unit ? ` (${s.unit})` : ""}${s.detail ? ` · ${s.detail}` : ""}. ` +
        (a.shared.length > 1 ? `그런 문항이 모두 ${a.shared.length}개입니다. ` : "") +
        "한 아이가 틀린 것은 그 아이 일이지만, 절반이 틀렸으면 **우리가 안 가르친 것**입니다.",
    });
  }

  if (a.weakUnits.length > 0) {
    const w = a.weakUnits[0];
    out.push({
      head: "다시 볼 단원",
      body:
        `**${w.unit}** 에서 가장 많이 틀렸습니다 — ${w.questions}문항 중 ` +
        `${w.touched}문항에서, 아이들이 푼 ${w.questions * a.n}번 가운데 ${w.wrongTotal}번(${w.wrongPct}%) 을 틀렸습니다.` +
        (a.weakUnits[1] ? ` 그다음은 ${a.weakUnits[1].unit} (${a.weakUnits[1].wrongPct}%) 입니다.` : ""),
    });
  }

  return out;
}
