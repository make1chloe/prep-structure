/**
 * **개인 성적 리포트** — 원장님이 주신 엑셀과 같은 것을 계산으로 낸다.
 *
 * 원장님 (2026-08-06) — 「학생별 오답 기록해서 이렇게 리포트 만들고 싶어」
 *
 * 여기에는 **계산과 문장만** 둔다 (DB 도 화면도 안 탄다).
 *
 * ── 학습포인트를 앱이 쓰는 이유 ──────────────────────────────
 *
 * 빈칸을 드리면 매번 처음부터 쓰셔야 하고, 그러면 결국 안 쓰게 된다.
 * 초안이 있으면 **고치신다.** 그래서 「듣기가 제일 높다 / 빈칸추론이 제일
 * 낮다 / 다음 목표는 몇 점」 까지는 앱이 쓰고, 아이 얘기는 원장님이 얹는다.
 *
 * 문장은 **숫자에서만** 나온다. 없는 것을 지어내지 않는다 —
 * 회차가 하나뿐이면 「상승」 이라고 하지 않고, 영역이 비면 그 줄을 안 쓴다.
 */

import { byArea, byTopic, specFor, TOPICS } from "./examSpec.js";

/** 100점 환산 */
function pct(s) {
  const raw = Number(s?.raw_score);
  const full = Number(s?.full_score);
  if (!Number.isFinite(raw)) return null;
  if (!Number.isFinite(full) || full <= 0) return raw;
  return Math.round((raw / full) * 1000) / 10;
}

const r0 = (v) => (v == null ? null : Math.round(v * 100));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * 한 회차 — 총점 · 정답률 · 영역별.
 *
 * @param score      scores 한 줄
 * @param items      score_items (그 회차 것만)
 * @param questions  이 회차의 문항표 (exam_questions) — 없으면 아래로
 * @param base       학원 기본 문항표 (exam_spec_rows) — 없으면 표준표
 */
export function oneRound(score, items = [], questions = [], base = []) {
  const wrongNos = (items || []).filter((i) => i.wrong).map((i) => Number(i.no));
  const spec = specFor(score?.kind, questions, 0, base);
  const area = byArea(spec, wrongNos);
  const topics = byTopic(spec, wrongNos);

  return {
    score,
    spec,
    items: items || [],
    wrongNos,
    // 문항표가 있을 때만 정답률이 뜻이 있다 (번호만 있으면 전체 문항수를 모른다)
    total: spec.length || null,
    wrong: wrongNos.length,
    rate: spec.length ? (spec.length - wrongNos.length) / spec.length : null,
    listen: area.listen,
    read: area.read,
    topics,
    point: pct(score),
    grade: score?.grade ?? null,
  };
}

/**
 * 여러 회차 — 누적 리포트.
 *
 * @param rounds  oneRound() 들 (오래된 것부터)
 */
export function stack(rounds = []) {
  const ok = rounds.filter((r) => r && r.point != null);
  const points = ok.map((r) => r.point);

  // **영역별 누적 정답률은 문항을 합쳐서 센다.** 회차별 정답률을 평균 내면
  // 문항이 하나뿐인 어법(29번)이 빈칸추론 넷과 같은 무게가 된다
  const bag = new Map();
  rounds.forEach((r) => {
    (r?.topics || []).forEach((t) => {
      if (!bag.has(t.topic)) bag.set(t.topic, { topic: t.topic, total: 0, wrong: 0 });
      const b = bag.get(t.topic);
      b.total += t.total;
      b.wrong += t.wrong;
    });
  });
  const known = TOPICS.filter((t) => bag.has(t)).map((t) => bag.get(t));
  const extra = [...bag.values()].filter((b) => !TOPICS.includes(b.topic));
  const topics = [...known, ...extra].map((b) => ({
    ...b,
    right: b.total - b.wrong,
    rate: b.total > 0 ? (b.total - b.wrong) / b.total : null,
  }));

  const sumArea = (key) => {
    const mine = rounds.map((r) => r?.[key]).filter(Boolean);
    if (mine.length === 0) return null;
    const total = mine.reduce((a, b) => a + b.total, 0);
    const wrong = mine.reduce((a, b) => a + b.wrong, 0);
    return { total, wrong, right: total - wrong, rate: total ? (total - wrong) / total : null };
  };

  const last = points.length ? points[points.length - 1] : null;
  const mean = avg(points);

  return {
    rounds,
    n: ok.length,
    mean: mean == null ? null : Math.round(mean * 10) / 10,
    last,
    best: points.length ? Math.max(...points) : null,
    // **최근 등급은 「적혀 있는 것 중 마지막」이다.** 마지막 회차에 등급이
    // 비어 있다고 「없음」 이라고 하면, 바로 앞 회차에 있는 것을 못 본다
    grade: [...ok].reverse().find((r) => r.grade != null)?.grade ?? null,
    listen: sumArea("listen"),
    read: sumArea("read"),
    topics,
    trend: trendOf(points),
  };
}

/**
 * 성적 흐름 — 상승 · 하락 · 유지.
 *
 * **최근 점수와 평균을 견준다** (엑셀이 그렇게 하고 있었다). 앞뒤 두 개만
 * 보면 한 번 못 본 날에 「하락」이 되어버린다.
 * 회차가 둘 미만이면 아무 말도 안 한다 — 한 번 보고 「상승」은 거짓말이다.
 */
export function trendOf(points = []) {
  if (points.length < 2) return { key: "none", label: "—", gap: null };
  const mean = avg(points);
  const last = points[points.length - 1];
  const gap = Math.round((last - mean) * 10) / 10;
  if (gap >= 2) return { key: "up", label: "상승", gap };
  if (gap <= -2) return { key: "down", label: "하락", gap };
  return { key: "flat", label: "유지", gap };
}

/** 영역별로 무엇을 시켜야 하나 — 보완 문장의 뒷말 */
const HOWTO = {
  듣기: "틀린 문항의 대본을 소리 내어 따라 읽고, 안 들린 표현을 따로 모아 다시 듣게 해주세요.",
  대의파악: "글의 첫 문장과 마지막 문장에 밑줄을 긋고, 선택지를 보기 전에 주제를 한 줄로 적어보게 해주세요.",
  세부정보파악: "선택지의 숫자·고유명사를 먼저 표시하고 본문에서 짚어가며 대조하는 연습이 필요합니다.",
  어법: "틀린 문항의 문법 항목을 이름으로 적게 하고, 같은 항목을 단원평가로 한 번 더 확인해주세요.",
  어휘: "밑줄 친 단어의 뜻이 아니라 **문맥에서의 쓰임**을 묻습니다. 앞뒤 문장의 연결어를 함께 보게 해주세요.",
  빈칸추론: "빈칸 앞뒤의 연결어와 반복되는 핵심어를 표시하고, 선택지를 보기 전에 결론을 먼저 예상하는 연습이 필요합니다.",
  간접쓰기: "지시어(this·they·such)가 무엇을 가리키는지 화살표로 잇는 연습이 가장 빠릅니다.",
  장문독해: "긴 글은 문단마다 한 줄 요약을 적게 하면 흐름을 놓치지 않습니다.",
};

/**
 * **학습포인트** — 숫자에서 나온 문장만.
 *
 * @param st    stack() 결과
 * @param name  학생 이름
 * @returns [{ head, body }]
 */
export function points(st, name = "") {
  const out = [];
  const has = (v) => v != null && Number.isFinite(v);
  const who = name ? `${name} 학생` : "이 학생";

  // 1) 흐름
  if (st.n >= 2 && has(st.mean) && has(st.last)) {
    const t = st.trend;
    const tail =
      t.key === "up" ? `최근 점수가 누적 평균보다 ${Math.abs(t.gap)}점 높아 성적 흐름이 올라가고 있습니다.`
      : t.key === "down" ? `최근 점수가 누적 평균보다 ${Math.abs(t.gap)}점 낮습니다. 이번 회차에 무슨 일이 있었는지 먼저 물어봐 주세요.`
      : "최근 점수가 누적 평균과 비슷해 흐름이 유지되고 있습니다.";
    out.push({
      head: "성적 흐름",
      body: `${who}의 ${st.n}회 평균은 ${st.mean}점이고 최근 점수는 ${st.last}점입니다. ${tail}` +
        (has(st.best) ? ` 최고 점수는 ${st.best}점입니다.` : "") +
        (st.grade != null ? ` 최근 등급은 ${st.grade}등급입니다.` : ""),
    });
  } else if (has(st.last)) {
    out.push({
      head: "이번 결과",
      body: `${who}의 점수는 ${st.last}점입니다.` +
        (st.grade != null ? ` 등급은 ${st.grade}등급입니다.` : "") +
        " 회차가 쌓이면 흐름과 약한 영역을 함께 보여드립니다.",
    });
  }

  // 2) 강점 · 3) 보완 — **문항이 세 개 이상인 영역만** 본다.
  //    어법은 한 문항이라 하나만 틀려도 정답률 0%가 된다. 그것을 「제일
  //    약한 영역」이라고 말하면 매번 어법이 나온다
  const solid = (st.topics || []).filter((t) => t.total >= 3 && t.rate != null);
  if (solid.length >= 2) {
    const sorted = [...solid].sort((a, b) => b.rate - a.rate);
    const top = sorted[0];
    const bot = sorted[sorted.length - 1];
    out.push({
      head: "강점",
      body: `${top.topic} 영역의 정답률이 ${r0(top.rate)}%로 가장 높습니다 (${top.right}/${top.total}). ` +
        "맞힌 문항도 근거를 한 번 더 확인하면 이 강점이 안정적으로 유지됩니다.",
    });
    if (bot.topic !== top.topic) {
      out.push({
        head: "보완할 부분",
        body: `${bot.topic} 영역의 정답률이 ${r0(bot.rate)}%로 가장 낮습니다 (${bot.right}/${bot.total}). ` +
          (HOWTO[bot.topic] || "틀린 문항의 정답 근거를 문장으로 적게 해주세요."),
      });
    }
  }

  // 4) 다음 목표 — 최고 점수를 1차 목표로 (없으면 최근 +3)
  if (has(st.last)) {
    const goal = has(st.best) && st.best > st.last ? st.best : Math.min(100, Math.round(st.last + 3));
    const weak = solid.length >= 2 ? [...solid].sort((a, b) => a.rate - b.rate)[0] : null;
    out.push({
      head: "다음 목표",
      body: `다음 시험은 ${goal}점을 1차 목표로 잡습니다.` +
        (weak ? ` 가장 약한 ${weak.topic}에서 한 문항만 더 맞히면 닿는 거리입니다.` : ""),
    });
  }

  return out;
}
