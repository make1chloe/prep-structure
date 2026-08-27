/**
 * **학년은 정해진 값이다** (원장님, 2026-08-09 — 「db가 있어서 선택하면
 * 되는 것을 텍스트로 적게 되어 있는 거 없는지 전수검사해」).
 *
 * 표로 둘 것까지는 없지만 값은 열둘로 끝난다. 그런데 다섯 군데에서 손으로
 * 적고 있었고, 그래서 이런 것들이 섞여 들어왔다 —
 *
 *   중2 · 중 2 · 2학년 · 중학교 2학년 · 초6 · 6학년
 *
 * 학년으로 거르는 자리가 앱에 여럿이다 (모의고사 배정, 학사일정 학년별,
 * 시험범위, 성적). 글자가 다르면 그 아이는 **조용히 안 걸린다.**
 */

const SCHOOL_LEVELS = [
  { level: "초", label: "초등", count: 6 },
  { level: "중", label: "중등", count: 3 },
  { level: "고", label: "고등", count: 3 },
];

/** 초1 … 고3 — 이 열둘이 전부다 */
export const GRADES = SCHOOL_LEVELS.flatMap(({ level, count }) =>
  Array.from({ length: count }, (_, i) => `${level}${i + 1}`)
);

/**
 * 손으로 적힌 것을 「중2」 꼴로 편다.
 *
 * **못 알아보면 그대로 돌려준다.** 「졸업」 처럼 우리가 모르는 것을 빈칸으로
 * 만들면 적어두신 것이 사라진다 — 모르는 것은 잃지 않는 쪽이 늘 낫다.
 */
export function normalizeGrade(raw = "") {
  const s = String(raw || "").replace(/\s+/g, "");
  if (!s) return "";
  const m = s.match(/(초|중|고)(?:등)?(?:학교)?\s*([1-6])/);
  if (m) {
    const level = m[1];
    const n = Number(m[2]);
    const max = SCHOOL_LEVELS.find((x) => x.level === level)?.count || 6;
    if (n >= 1 && n <= max) return `${level}${n}`;
  }
  return raw;
}

/**
 * 고르는 칸에 세울 목록.
 *
 * **지금 적혀 있는 값이 목록에 없으면 그것도 넣어준다.** 없으면 칸이 빈
 * 것처럼 보이고, 그대로 저장하면 원래 적혀 있던 것이 지워진다.
 * (상담 화면의 유입경로가 실제로 그렇게 지우고 있었다 — 0114 참고)
 */
export function gradeChoices(current = "") {
  const cur = String(current || "").trim();
  return cur && !GRADES.includes(cur) ? [cur, ...GRADES] : GRADES;
}
