/**
 * 성적 — 학교 시험 · 모의고사 · 단원평가.
 *
 * 여기에는 **계산과 판단만** 둔다 (망도 DB 도 안 탄다).
 */

export const KINDS = [
  { key: "school", label: "내신", hint: "학교 중간·기말고사" },
  { key: "mock", label: "모의고사", hint: "학평 · 모평 · 수능" },
  { key: "unit", label: "단원평가", hint: "학원에서 보는 것" },
];

export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));

/**
 * 이 성적에 쓸 **등급컷**을 고른다.
 *
 * 컷은 학생 것이 아니라 **그 학교 그 회차 시험** 것이다. 그래서 회차(exam_periods)에
 * 한 번만 적어두고, 그 시험을 본 학생 전부가 같은 컷을 본다. 성적 줄마다 적으면
 * 신송중 학생 셋이 같은 값을 세 번 적게 되고, 하나만 잘못 쳐도 그 학생만
 * 등급이 다르게 나온다 — 어느 것이 맞는지 알 수가 없다.
 *
 * 회차에 컷이 없을 때만 성적 줄의 것(scores.cuts)을 쓴다. 그건 시험 일정에
 * 없는 시험 — 전학 오기 전 학교, 오래된 것 — 의 피난처다.
 *
 * @returns { cuts, from } from: 'exam' | 'row' | null
 */
export function cutsFor(score, exam = null) {
  const ex = (exam?.cuts || []).map(Number).filter(Number.isFinite);
  if (ex.length > 0) return { cuts: ex, from: "exam", exam };
  const own = (score?.cuts || []).map(Number).filter(Number.isFinite);
  if (own.length > 0) return { cuts: own, from: "row", exam: null };
  return { cuts: [], from: null, exam: null };
}

/**
 * 이 성적이 **어느 회차**인가 — 학교 · 학년 · 본 날로 찾는다.
 *
 * 내신은 학생의 학교 시험이고, 모의고사는 전국 공통이라 학교가 '전국' 이다.
 * 날짜는 시험 기간 안에 들면 그 회차, 아니면 가장 가까운 회차를 본다
 * (성적표를 나중에 받아 적으면 본 날을 며칠 어긋나게 적기 쉽다).
 */
export function findExam(score, exams = [], student = null) {
  if (!score) return null;
  const kind = score.kind || "school";
  if (kind === "unit") return null;                 // 우리가 낸 것 — 회차가 없다

  const want = kind === "mock" ? "전국" : (score.school || student?.school || "");
  if (!want) return null;
  const norm = (v) => (v || "").toString().replace(/\s/g, "");
  const day = score.taken_on || "";

  const same = exams.filter((e) => norm(e.school) === norm(want));
  if (same.length === 0) return null;
  // 학년이 적혀 있으면 맞춰본다 (비어 있는 회차는 전 학년 공통으로 본다)
  const g = student?.grade || "";
  const byGrade = same.filter((e) => !e.grade || !g || norm(e.grade) === norm(g));
  const pool = byGrade.length ? byGrade : same;

  if (!day) return pool[0] || null;
  const inside = pool.find((e) => e.from_date <= day && day <= e.to_date);
  if (inside) return inside;
  // 기간 밖이면 가장 가까운 회차
  const dist = (e) =>
    Math.min(
      Math.abs(new Date(e.from_date) - new Date(day)),
      Math.abs(new Date(e.to_date) - new Date(day))
    );
  return [...pool].sort((a, b) => dist(a) - dist(b))[0] || null;
}

/** 100점 만점으로 환산 (만점이 없으면 원점수를 그대로) */
function pct100(s) {
  const raw = Number(s?.raw_score);
  const full = Number(s?.full_score);
  if (!Number.isFinite(raw)) return null;
  if (!Number.isFinite(full) || full <= 0) return raw;
  return Math.round((raw / full) * 1000) / 10;
}

/**
 * 등급컷으로 등급을 매긴다.
 *
 * cuts 는 1등급컷부터 순서대로다. [90, 84, 77] 이면
 *   90점 이상 → 1등급, 84점 이상 → 2등급, 77점 이상 → 3등급, 그 밑은 4등급.
 *
 * **적어둔 등급을 이긴다고 보지 않는다.** 학교가 발표한 등급이 있으면 그게 맞고,
 * 컷은 "다음 시험에 몇 점이면 몇 등급인지" 를 가늠하는 데 쓴다.
 */
export function gradeByCuts(score, cuts) {
  const n = Number(score);
  const list = (cuts || []).map(Number).filter((x) => Number.isFinite(x));
  if (!Number.isFinite(n) || list.length === 0) return null;
  for (let i = 0; i < list.length; i += 1) {
    if (n >= list[i]) return i + 1;
  }
  return list.length + 1;
}

/**
 * 다음 등급까지 몇 점 남았나 — "3점만 더" 가 "2등급" 보다 움직이게 한다.
 * 이미 1등급이면 null.
 */
function toNextGrade(score, cuts) {
  const n = Number(score);
  const list = (cuts || []).map(Number).filter((x) => Number.isFinite(x));
  if (!Number.isFinite(n) || list.length === 0) return null;
  const g = gradeByCuts(n, list);
  if (!g || g <= 1) return null;
  const need = list[g - 2];           // 한 등급 위의 컷
  if (!Number.isFinite(need)) return null;
  return Math.round((need - n) * 10) / 10;
}

/**
 * 한 줄로 읽히게 — "89점 · 2등급 · 1등급까지 1점"
 *
 * @param exam 이 성적의 회차 (findExam 으로 찾은 것). 회차에 컷이 있으면
 *             그것을 쓰고, 없으면 성적 줄에 적힌 것을 쓴다.
 */
export function summary(s, exam = null) {
  const parts = [];
  const p = pct100(s);
  if (p != null) {
    parts.push(
      Number(s.full_score) && Number(s.full_score) !== 100
        ? `${s.raw_score}/${s.full_score}점`
        : `${s.raw_score}점`
    );
  }
  const { cuts } = cutsFor(s, exam);
  const g = s?.grade || gradeByCuts(s?.raw_score, cuts);
  if (g) parts.push(`${g}등급`);
  if (s?.percentile != null) parts.push(`백분위 ${s.percentile}`);
  if (s?.rank_in && s?.rank_of) parts.push(`${s.rank_in}/${s.rank_of}등`);

  const left = toNextGrade(s?.raw_score, cuts);
  if (left != null && left > 0) parts.push(`${g - 1}등급까지 ${left}점`);
  return parts.join(" · ");
}

/**
 * 같은 종류끼리 **시간 순으로** 묶는다. 올랐는지 내렸는지는 옆에 놓고 봐야 안다.
 * 최근 것이 앞이다.
 */
export function byKind(scores = []) {
  const out = {};
  KINDS.forEach((k) => {
    out[k.key] = scores
      .filter((s) => (s.kind || "school") === k.key)
      .sort((a, b) => (b.taken_on || "").localeCompare(a.taken_on || ""));
  });
  return out;
}

/** 지난번과 견줘 얼마나 — 오른쪽이 최근이다 */
export function trendOf(list = []) {
  const withScore = list.filter((s) => Number.isFinite(Number(s.raw_score)));
  if (withScore.length < 2) return null;
  const now = Number(withScore[0].raw_score);
  const before = Number(withScore[1].raw_score);
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return { diff: 0, text: "지난번과 같아요" };
  return { diff, text: diff > 0 ? `지난번보다 ${diff}점 올랐어요` : `지난번보다 ${-diff}점 내렸어요` };
}
