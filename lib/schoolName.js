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

/**
 * 지역 이름 — **나이스는 붙여 부르고 나는 안 붙인다.**
 *
 *   내가 적은 것    현송중      해송고
 *   나이스가 준 것  인천현송중학교  인천해송고등학교
 *
 * 위 schoolKey 로는 이 둘이 다른 학교가 된다. 그렇다고 schoolKey 에서
 * 지역을 떼면 **SQL 의 school_key() 와 어긋난다.** 그래서 떼는 것은
 * 여기 따로 둔다 — 이건 「같은 학교 아니에요?」 하고 **물어보는 데만** 쓴다.
 * 합칠지 말지는 원장님이 누른다.
 */
const REGION =
  /^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/;

/**
 * 물어보기용 열쇠 — 지역 이름까지 뗀 것.
 * 뗀 나머지가 너무 짧으면 안 뗀다 (「인천중」의 「인천」은 학교 이름이다).
 */
export function looseKey(name) {
  const k = schoolKey(name);
  const m = k.match(REGION);
  if (m && k.length - m[0].length >= 3) return k.slice(m[0].length);
  return k;
}

function groupBy(names, keyOf) {
  const by = new Map();
  for (const n of names) {
    const k = keyOf(n);
    if (!k) continue;
    if (!by.has(k)) by.set(k, new Set());
    by.get(k).add(n);
  }
  return [...by.entries()]
    .map(([key, set]) => ({ key, names: [...set] }))
    .filter((g) => g.names.length > 1);
}

/** 목록에서 같은 학교로 보이는 것끼리 묶는다 (SQL 과 같은 기준) */
export function schoolGroups(names = []) {
  return groupBy(names, schoolKey);
}

/** 지역 이름 차이까지 봐준 것 — 화면에서 「합칠까요?」 하고 물어볼 때 쓴다 */
export function schoolAlike(names = []) {
  return groupBy(names, looseKey);
}
