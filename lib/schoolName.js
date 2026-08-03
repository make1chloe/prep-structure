/**
 * 학교 이름을 **같은 학교인지** 알아보게 다듬는다.
 *
 * 교재 이름과 같은 문제다 (lib/bookName). 「신송중」과 「신송중학교」가
 * 다른 학교가 되면
 *   · 재원생의 학교와 시험 일정의 학교가 안 이어지고
 *   · 같은 학교 시험이 둘로 갈리고
 *   · 등급컷을 두 번 적게 된다
 *
 * 규칙 — **줄임말을 편다.**
 *   신송중학교 · 신송중  → 신송중
 *   연수여자고등학교 · 연수여고 → 연수여고 (여자고등학교 = 여고)
 *   띄어쓰기 · 괄호 · 대소문자는 없앤다
 *
 * 이 규칙은 **SQL 쪽 public.school_key() 와 똑같아야 한다** (0076).
 * 한쪽만 고치면 앱에서는 같은 학교인데 DB 에서는 다른 학교가 된다.
 */

/** 긴 말 → 짧은 말. 순서가 중요하다 (여자중학교를 중학교보다 먼저 본다) */
const FORMS = [
  [/여자중학교/g, "여중"],
  [/여자고등학교/g, "여고"],
  [/남자중학교/g, "남중"],
  [/남자고등학교/g, "남고"],
  [/초등학교/g, "초"],
  [/중학교/g, "중"],
  [/고등학교/g, "고"],
];

const DROP = /[\s·・.,\-–—_/\\()[\]{}'"“”‘’]/g;

/** 비교용 열쇠. 같은 열쇠면 같은 학교로 본다. */
export function schoolKey(name) {
  const raw = (name || "").toString().trim();
  if (!raw) return "";
  let s = raw.toLowerCase();
  FORMS.forEach(([re, to]) => { s = s.replace(re, to); });
  s = s.replace(DROP, "");
  return s || raw.toLowerCase();
}

export function sameSchool(a, b) {
  const k = schoolKey(a);
  return !!k && k === schoolKey(b);
}

/** 목록에서 같은 학교로 보이는 것끼리 묶는다 */
export function schoolGroups(names = []) {
  const by = new Map();
  for (const n of names) {
    const k = schoolKey(n);
    if (!k) continue;
    if (!by.has(k)) by.set(k, new Set());
    by.get(k).add(n);
  }
  return [...by.entries()]
    .map(([key, set]) => ({ key, names: [...set] }))
    .filter((g) => g.names.length > 1);
}
