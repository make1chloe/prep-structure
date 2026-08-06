/**
 * **상담 문구** — 리포트를 그대로 옮겨 적은 글.
 *
 * 원장님 (2026-08-06) — 다른 학원 화면의 「상담 문구 복사」 를 보시고.
 *
 * ── 왜 화면이 있는데 글이 또 필요한가 ────────────────────
 *
 * 어머니께 말씀드릴 때는 **글**이 필요하다. 화면을 보여드리는 자리도 있지만,
 * 문자로 보내거나 상담일지에 붙이거나 통화 중에 읽으실 때는 글이라야 한다.
 * 화면을 보면서 옮겨 적으면 숫자를 하나씩 옮기다가 틀리고, 그러면 다음부터
 * 안 쓰신다.
 *
 * ── 어떻게 쓰나 ──────────────────────────────────────────
 *
 * **숫자를 앞에, 해석을 뒤에.** 어머니가 제일 먼저 보시는 것은 점수다.
 * 해석부터 쓰면 「그래서 몇 점인데요」 를 되물으신다.
 *
 * **없는 것은 안 쓴다.** 회차가 하나면 「흐름」 을 안 쓰고, 영역이 비면
 * 그 줄이 통째로 빠진다. 「— 」 이 늘어선 글은 안 읽힌다.
 *
 * **원장님이 고쳐 쓰시는 초안이다.** 아이 얘기(요즘 태도·집에서의 일)는
 * 앱이 모른다. 숫자로 말할 수 있는 데까지만 쓰고 나머지는 비워둔다.
 */

const r0 = (v) => (v == null ? null : Math.round(v * 100));

/**
 * @param st     lib/report.js 의 stack() 결과
 * @param name   학생 이름
 * @param notes  lib/report.js 의 points() 결과
 * @param opts   { kindLabel, academy }
 */
export function consultText(st, name = "", notes = [], opts = {}) {
  const kind = opts.kindLabel || "모의고사";
  const who = name || "학생";
  const lines = [];

  lines.push(`[${who} ${kind} 학습 리포트]`);
  lines.push("");

  // ── 숫자 ─────────────────────────────────────────────
  const nums = [];
  if (st?.n) nums.push(`${st.n}회 응시`);
  if (st?.mean != null) nums.push(`평균 ${st.mean}점`);
  if (st?.last != null) nums.push(`최근 ${st.last}점`);
  if (st?.best != null) nums.push(`최고 ${st.best}점`);
  if (st?.grade != null) nums.push(`최근 ${st.grade}등급`);
  if (nums.length) lines.push(`▪ ${nums.join(" · ")}`);

  if (st?.listen) lines.push(`▪ 듣기 ${r0(st.listen.rate)}% (${st.listen.right}/${st.listen.total})`);
  if (st?.read) lines.push(`▪ 독해 ${r0(st.read.rate)}% (${st.read.right}/${st.read.total})`);

  // 흐름은 **두 번 이상 봤을 때만.** 한 번 보고 「상승」 은 거짓말이다
  if (st?.n >= 2 && st.trend?.key && st.trend.key !== "none") {
    lines.push(`▪ 성적 흐름 : ${st.trend.label}`);
  }

  // ── 영역별 ───────────────────────────────────────────
  // **문항이 셋 이상인 영역만.** 어법은 45문항 중 하나라 한 번만 틀려도
  // 0% 가 되는데, 그것을 「가장 약한 영역」 이라고 어머니께 말씀드리면
  // 매번 어법 이야기만 하게 된다
  const solid = (st?.topics || []).filter((t) => t.total >= 3 && t.rate != null);
  if (solid.length >= 2) {
    const sorted = [...solid].sort((a, b) => b.rate - a.rate);
    lines.push("");
    lines.push("[영역별 정답률]");
    sorted.forEach((t) => {
      lines.push(`  ${t.topic} ${r0(t.rate)}% (${t.right}/${t.total})`);
    });
  }

  // ── 회차별 ───────────────────────────────────────────
  const rounds = (st?.rounds || []).filter((r) => r?.point != null);
  if (rounds.length >= 2) {
    lines.push("");
    lines.push("[회차별]");
    rounds.forEach((r, i) => {
      const bits = [`${i + 1}회`, r.score?.term || "", r.score?.taken_on || "", `${r.point}점`];
      if (r.grade != null) bits.push(`${r.grade}등급`);
      lines.push(`  ${bits.filter(Boolean).join(" · ")}`);
    });
  }

  // ── 해석 ─────────────────────────────────────────────
  if (notes?.length) {
    lines.push("");
    notes.forEach((n) => {
      lines.push(`[${n.head}]`);
      lines.push(n.body);
      lines.push("");
    });
  }

  if (opts.academy) {
    lines.push(`— ${opts.academy}`);
  }

  // 빈 줄이 셋 이상 이어지면 문자로 보낼 때 지저분하다
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 아이에게 보낼 짧은 글 — 어머니께 드리는 글과 말투가 다르다 */
export function studentText(st, name = "", notes = []) {
  const lines = [];
  lines.push(`${name ? `${name}아, ` : ""}이번 결과야.`);
  if (st?.last != null) {
    lines.push(
      `최근 ${st.last}점` +
        (st.mean != null && st.n >= 2 ? ` (${st.n}회 평균 ${st.mean}점)` : "") +
        (st.grade != null ? ` · ${st.grade}등급` : "")
    );
  }
  const solid = (st?.topics || []).filter((t) => t.total >= 3 && t.rate != null);
  if (solid.length >= 2) {
    const sorted = [...solid].sort((a, b) => b.rate - a.rate);
    lines.push(`잘한 곳: ${sorted[0].topic} ${r0(sorted[0].rate)}%`);
    lines.push(`볼 곳: ${sorted[sorted.length - 1].topic} ${r0(sorted[sorted.length - 1].rate)}%`);
  }
  const weak = notes?.find((n) => n.head === "보완할 부분");
  if (weak) lines.push("", weak.body);
  return lines.join("\n").trim();
}
