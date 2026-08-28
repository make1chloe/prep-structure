/**
 * **골라 담는 판의 글자 거르기 — 한 벌** (원장님 2026-08-28).
 *
 * 단원 고르기(components/UnitPickModal)에서 정한 규칙인데, 등원 학습 항목
 * 고르기도 같은 물음을 만났다. 두 벌로 두면 한쪽에서만 「E」 가 안 나온다.
 *
 * ── 규칙 (원장님 — 「E단원 검색하면 안 나옴」) ────────────────────
 * 전에는 어디든 그 글자가 들어가면 걸렸다. 「E」 를 치면 `정관사 the`·
 * `be동사` 처럼 **e 가 든 것이 죄다** 나와서, 정작 찾던 「E …」 는 그 속에
 * 묻혔다. 한글은 두 글자만 돼도 뜻이 좁혀지지만 알파벳 한 글자는 안 좁혀진다.
 *
 * 그래서 **두 글자 이하면 「그 말로 시작하는가」**, 세 글자부터는 종전대로
 * **어디든 들어가면** 걸린다.
 */

/**
 * 검색어 하나로 **한 칸을 견주는 함수**를 만든다.
 * 빈 검색어면 null — 부르는 쪽이 「거르지 않는다」 로 읽는다.
 */
export function keywordHit(keyword) {
  const kw = String(keyword || "").trim().toLowerCase();
  if (!kw) return null;
  const short = kw.length <= 2;
  return (v) => {
    if (v === null || v === undefined || v === "") return false;
    const s = String(v).toLowerCase();
    return short ? s.startsWith(kw) : s.includes(kw);
  };
}

/**
 * 여러 칸 중 **하나라도** 걸리면 남긴다.
 * @param list    거를 목록
 * @param keyword 검색어
 * @param fields  (x) => [칸, 칸, …] — 견줄 칸들
 */
export function keywordFilter(list = [], keyword, fields) {
  const hit = keywordHit(keyword);
  if (!hit) return list;
  return list.filter((x) => (fields(x) || []).filter(Boolean).some(hit));
}
