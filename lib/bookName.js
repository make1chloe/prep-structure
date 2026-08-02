/**
 * 교재 이름을 **같은 교재인지** 알아보게 다듬는다.
 *
 * 왜 필요한가
 *   엑셀에서 올린 이름과 앱에 이미 있던 이름이 조금만 달라도 — 띄어쓰기 하나,
 *   「2025 개정」 같은 꼬리표 하나 — 지금까지는 **다른 교재**가 하나 더 생겼다.
 *   그러면 배정은 옛 교재에, 단원은 새 교재에 붙어서 진도가 둘로 갈린다.
 *   화면에는 똑같은 이름 두 줄이 보이는데 어느 쪽이 진짜인지 알 수가 없다.
 *
 * 어떻게
 *   비교할 때만 쓰는 **열쇠**를 따로 만든다. 보여주는 이름은 손대지 않는다.
 *   원장님이 적으신 이름 그대로 화면에 나와야 하기 때문이다.
 *
 * 무엇을 같다고 볼 것인가 — 조심스럽게 정한다. 지나치게 뭉치면 진짜 다른 교재가
 * 하나로 합쳐진다. 그래서 **숫자와 글자는 절대 지우지 않는다.**
 *   · 띄어쓰기 · 가운뎃점 · 괄호 · 하이픈 같은 것            → 없앤다
 *   · 대소문자                                              → 맞춘다
 *   · 「2025 개정」 「개정판」 「신판」 「2판」 같은 판 표시  → 없앤다
 *   · 이름 앞뒤에 붙은 연도 (2024, 2025 …)                  → 없앤다
 *
 * 반대로 이런 것은 **남긴다** — 다른 책이다.
 *   · 리딩튜터 입문 / 리딩튜터 기본  (뒷말이 다르다)
 *   · 능률 1 / 능률 2                (숫자가 가운데 있다)
 */

/** 판·쇄 표시 — 이것만 있고 없고는 같은 책이다 */
const EDITION = /(개정판|개정증보판|개정|증보판|신판|전면개정|리뉴얼|new\s*edition|revised)/gi;
/** 이름 앞이나 뒤에 붙은 연도 — 가운데 숫자는 건드리지 않는다 */
const YEAR_EDGE = /(^\s*(19|20)\d{2}\s*(년|년도)?\s*|\s*(19|20)\d{2}\s*(년|년도)?\s*$)/g;
/** 붙임표·괄호·따옴표 — 적는 사람 습관일 뿐이다 */
const PUNCT = /[\s·・.,\-–—_/\\()[\]{}'"“”‘’!?~]/g;

/**
 * 비교용 열쇠. 같은 열쇠면 같은 교재로 본다.
 * 열쇠가 비면(기호만 있는 이름) 원래 이름을 소문자로 돌려준다 — 뭉치지 않게.
 */
export function bookKey(name) {
  const raw = (name || "").toString().trim();
  if (!raw) return "";
  let s = raw.toLowerCase();
  s = s.replace(EDITION, " ");
  s = s.replace(YEAR_EDGE, " ");
  s = s.replace(PUNCT, "");
  return s || raw.toLowerCase();
}

/** 두 이름이 같은 교재인가 */
export function sameBook(a, b) {
  const ka = bookKey(a);
  return !!ka && ka === bookKey(b);
}

/**
 * 목록에서 **같은 교재로 보이는 것끼리** 묶는다.
 * @returns [{ key, books:[...] }] — 두 권 이상인 묶음만
 */
export function dupGroups(books = []) {
  const by = new Map();
  for (const b of books) {
    const k = bookKey(b?.name);
    if (!k) continue;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(b);
  }
  return [...by.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, books: list }));
}

/**
 * 합칠 때 **어느 것을 남길지.**
 * 쓰고 있는 학생이 많은 쪽 → 단원이 많은 쪽 → 먼저 만든 쪽.
 * (지금까지 쌓인 것이 가장 많은 쪽으로 모으는 것이 덜 잃는다)
 */
export function pickKeeper(books = []) {
  return [...books].sort((a, b) =>
    (b.students ?? 0) - (a.students ?? 0) ||
    (b.units ?? 0) - (a.units ?? 0) ||
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  )[0] || null;
}
