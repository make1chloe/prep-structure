/** 판 항목의 상태 낱말 한 벌 — DB(v2.day_item.status) 의 CHECK 와 같다: none(아직) · done ○ · weak △ · missing ✕ · inclass. 기본값은 'none'(0052) — 비어 있는 것과 같이 「아직 안 봄」이다.
 *  순수 파일 — 화면(클라이언트)과 서버 둘 다 들여온다 */
export const isUnchecked = (item) => !item?.status || item.status === "none";
export const CHECK = Object.freeze([["done", "○"], ["weak", "△"], ["missing", "✕"]]);
