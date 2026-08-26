/**
 * **골든 검사의 순수 부품** — 날짜 정규화 · 펼치기 · 사람 읽는 diff.
 *
 * 브라우저도 Postgres 도 없이 돈다 — 그래서 맥(로컬)에서도
 * `node scripts/e2e/golden-dayboard.mjs --selftest` 로 이 부품만은
 * 실측할 수 있다 (고정 입력 → 고정 출력).
 *
 * ── 왜 날짜를 토큰으로 바꾸나 ─────────────────────────────
 *
 * 씨앗(seed.sql·golden-dayboard 의 추가 씨앗)은 전부 **오늘(current_date)
 * 기준 상대 날짜**다. 그대로 박제하면 골든이 뜬 날에만 초록이고 다음 날부터
 * 빨갛다 — 그래서 화면에 찍힌 날짜를 「오늘로부터 며칠」(⟨D+n⟩)로 치환해
 * 어느 날 떠도 같은 골든이 나오게 한다. 요일 표기도 요일 따라 흔들리므로
 * 날짜 토큰 뒤의 (수) 같은 것은 (요일) 로 눕힌다.
 */

/** 한국 시각 기준 오늘 (seed.sql 의 current_date 와 같은 눈높이 — click.mjs 선례) */
export function kstToday() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 화면 글자 정규화.
 *
 *   · baseIso±40일 안의 날짜 표기를 ⟨D±n⟩ 토큰으로 (ISO · 08/26 · 8/26 ·
 *     8월 26일 · 「2026. 8. 26.」 · 「8. 26.」 — 화면이 실제로 쓰는 표기들)
 *   · 날짜 토큰 바로 뒤의 요일 괄호 → (요일)
 *   · 「n분 전」 류 경과 표시 → N분 전 (뜨는 순간마다 다른 숫자)
 *   · 공백 접기 · 빈 줄 버리기
 *
 * 못 가리는 것: 날짜가 아닌 「1/2」(클카 완료 수 등)가 우연히 base±40일의
 * 월/일과 겹치면 토큰이 될 수 있다 — 셈은 같은 씨앗이면 같으므로 비교는
 * 여전히 성립한다 (토큰끼리 같음).
 */
export function normalizeText(raw, baseIso) {
  let t = String(raw ?? "");
  for (let n = -40; n <= 40; n += 1) {
    const iso = addDays(baseIso, n);
    const [y, m, d] = iso.split("-");
    const mi = String(Number(m));
    const di = String(Number(d));
    const tok = `⟨D${n >= 0 ? "+" : ""}${n}⟩`;
    for (const p of [
      new RegExp(`${y}-${m}-${d}`, "g"),
      new RegExp(`${y}\\. ?${mi}\\. ?${di}\\.`, "g"),
      new RegExp(`(?<![0-9/.])${m}/${d}(?![0-9/])`, "g"),
      new RegExp(`(?<![0-9/.])${mi}/${di}(?![0-9/])`, "g"),
      new RegExp(`(?<![0-9])${mi}월 ?${di}일`, "g"),
      new RegExp(`(?<![0-9.])${mi}\\. ${di}\\.`, "g"),
    ]) t = t.replace(p, tok);
  }
  t = t.replace(/⟩ ?\([월화수목금토일]\)/g, "⟩(요일)");
  t = t.replace(/\d+(초|분|시간|일)( ?)(전|째)/g, "N$1$2$3");
  return t
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** 골든 나무를 「경로 → 글자」 로 펼친다 — diff 가 이 위에서 돈다 */
export function flatten(v, path = "", out = {}) {
  if (v === null || typeof v !== "object") {
    out[path || "(값)"] = String(v);
    return out;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => flatten(x, `${path}[${i}]`, out));
    return out;
  }
  for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path} › ${k}` : k, out);
  return out;
}

/** 여러 줄 글자 두 벌 — 서로 없는 줄만 추린다 (같은 줄은 조용히) */
function lineDiff(a, b) {
  const A = a.split("\n");
  const B = b.split("\n");
  const setA = new Set(A);
  const setB = new Set(B);
  const gone = A.filter((x) => !setB.has(x));
  const born = B.filter((x) => !setA.has(x));
  if (gone.length === 0 && born.length === 0) return ["  (같은 줄들 — 순서만 다릅니다)"];
  return [
    ...gone.map((x) => `  − ${x}`),
    ...born.map((x) => `  ＋ ${x}`),
  ];
}

/**
 * 골든과 지금 판을 견준다 — **어느 학생·어느 구역이 달라졌는지** 사람이
 * 읽을 수 있는 줄로. 같으면 빈 배열.
 */
export function diffGolden(golden, current) {
  const a = flatten(golden);
  const b = flatten(current);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out = [];
  for (const k of keys) {
    if (!(k in b)) out.push(`− ${k}\n  (지금 판에 없음)`);
    else if (!(k in a)) out.push(`＋ ${k}\n  (골든에 없음)\n${b[k].split("\n").map((x) => `  ＋ ${x}`).join("\n")}`);
    else if (a[k] !== b[k]) out.push(`≠ ${k}\n${lineDiff(a[k], b[k]).join("\n")}`);
  }
  return out;
}

/**
 * 부품 자체검사 — 고정 입력 → 고정 출력. 여기가 어긋나면 골든 비교 전체를
 * 못 믿으므로, golden-dayboard.mjs 는 **매번 이걸 먼저** 돌리고 시작한다.
 */
export function selftest() {
  const base = "2026-08-27";
  const cases = [
    // 날짜 표기 6형 + 요일 눕히기
    ["2026-09-06 수업", "⟨D+10⟩ 수업"],
    ["09/06 수업에 낸 숙제 3개", "⟨D+10⟩ 수업에 낸 숙제 3개"],
    ["9/6 (일) 보강", "⟨D+10⟩(요일) 보강"],
    ["9월 6일 결석", "⟨D+10⟩ 결석"],
    ["2026. 9. 6. 오후 12:00", "⟨D+10⟩ 오후 12:00"],
    ["8. 26. 오전 9:00", "⟨D-1⟩ 오전 9:00"],
    ["범위 밖 2027-01-01 은 그대로", "범위 밖 2027-01-01 은 그대로"],
    // 「수업」 의 수 를 요일로 잘못 먹으면 안 된다
    ["⟨D-1⟩ 수업에 낸 숙제", "⟨D-1⟩ 수업에 낸 숙제"],
    // 경과 표시
    ["3분 전에 눌렀어요", "N분 전에 눌렀어요"],
    ["12시간 전", "N시간 전"],
    // 공백 접기 · 빈 줄 버리기
    ["  두   칸\n\n  띄어도  ", "두 칸\n띄어도"],
  ];
  const bad = [];
  for (const [inp, want] of cases) {
    const got = normalizeText(inp, base);
    if (got !== want) bad.push(`normalizeText(${JSON.stringify(inp)})\n  기대: ${JSON.stringify(want)}\n  실제: ${JSON.stringify(got)}`);
  }
  const d = diffGolden(
    { 학생: { 검사: "숙제 ○\n단어 △" }, 그대로: "같다" },
    { 학생: { 검사: "숙제 ○\n단어 ✕" }, 그대로: "같다" }
  );
  if (d.length !== 1 || !d[0].includes("학생 › 검사") || !d[0].includes("− 단어 △") || !d[0].includes("＋ 단어 ✕"))
    bad.push(`diffGolden 이 바뀐 줄을 못 짚습니다:\n${d.join("\n")}`);
  if (diffGolden({ a: "1" }, { a: "1" }).length !== 0) bad.push("diffGolden 이 같은 것을 다르다고 합니다");
  return bad;
}
