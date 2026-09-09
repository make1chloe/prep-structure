/** 진도 판단 중 순수한 것(DB 없음) — 검사 ○△✕ 가 단원 진도가 되는 규칙. 화면과 lib/progress.js 가 같이 쓴다.
 *  ○ → done · △ → doing · ✕ → 안 바꾼다(없으면 none). 예습(next)은 완료로 안 올린다 · 조각(range_note 「1-20번」처럼 일부만 낸 것)은 다 덮인 것이 아니라 doing 까지(확정-⑳ · 검사-⑭).
 *  이미 done 인 단원은 검사로 내려가지 않는다 — 내리는 것은 원장님이 진도 체크(02b)에서 손으로(되돌리기 한 자리, 확정-㊶) */
export const TRI = Object.freeze([["done", "○"], ["doing", "◐"], ["none", "·"]]);
/** 검사 줄 하나가 그 단원에 주는 상태 — null 이면 손대지 않는다 */
export function fromCheck({ status, slot, range_note, unit_id }) {
  if (!unit_id) return null;
  if (slot === "next") return null;                       // 예습은 완료로 안 올린다
  if (status === "done") return range_note ? "doing" : "done";   // 조각은 다 덮인 것이 아니다
  if (status === "weak") return "doing";
  return null;                                            // ✕ 나 검사 전 — 진도는 그대로
}
/** (러) 조각 읽기(확정-⑳) — 「1-20번」·「21-31번」(문항) · 「p.10-12」(쪽). 아니면 null(전체이거나 못 읽는 글 — 그러면 조각으로 세지 않는다) */
export function parsePart(note) {
  const s = String(note ?? "").trim(); if (!s) return null;
  let m = s.match(/^(\d+)\s*-\s*(\d+)\s*번$/); if (m) return { q_from: +m[1], q_to: +m[2], page_from: null, page_to: null };
  m = s.match(/^(\d+)\s*번$/); if (m) return { q_from: +m[1], q_to: +m[1], page_from: null, page_to: null };
  m = s.match(/^p\.?\s*(\d+)\s*-\s*(\d+)$/i); if (m) return { q_from: null, q_to: null, page_from: +m[1], page_to: +m[2] };
  m = s.match(/^p\.?\s*(\d+)$/i); if (m) return { q_from: null, q_to: null, page_from: +m[1], page_to: +m[1] };
  return null;
}
/** (러) 조각들이 원본을 얼마나 덮었나(확정-⑳) — 문항이 있으면 1..q_count, 없으면 쪽 page_start..page_end. 겹친 조각은 한 번만 센다 · 다 덮이면 done */
export function coverage(unit, parts = []) {
  const byQ = Number(unit?.q_count) > 0;
  const lo = byQ ? 1 : (Number(unit?.page_start) || 0), hi = byQ ? Number(unit.q_count) : (Number(unit?.page_end ?? unit?.page_start) || 0);
  if (!hi || hi < lo) return { total: 0, covered: 0, done: false, ranges: [], missing: [], byQ };
  const spans = (parts ?? []).map((p) => (byQ ? [p.q_from, p.q_to] : [p.page_from, p.page_to])).filter(([a, b]) => a != null && b != null).map(([a, b]) => [Math.max(lo, Math.min(+a, +b)), Math.min(hi, Math.max(+a, +b))]).filter(([a, b]) => a <= b).sort((x, y) => x[0] - y[0]);
  const ranges = []; for (const [a, b] of spans) { const last = ranges[ranges.length - 1]; if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b); else ranges.push([a, b]); }
  const covered = ranges.reduce((n, [a, b]) => n + (b - a + 1), 0), total = hi - lo + 1;
  const missing = []; let cur = lo; for (const [a, b] of ranges) { if (a > cur) missing.push([cur, a - 1]); cur = b + 1; } if (cur <= hi) missing.push([cur, hi]);
  return { total, covered, done: covered >= total, ranges, missing, byQ };
}
/** (러) 02b 줄 밑 글 — 「낸 것 1-20 · 남은 것 21-62」 · 쪽이면 「낸 것 p.10-12 · 남은 것 p.13-15」 · 다 덮이면 「낸 것 1-62 · 다 덮음」 · 조각이 없으면 빈 글 */
export function partsText(cov) {
  if (!cov || !cov.ranges.length) return "";
  const f = ([a, b]) => (cov.byQ ? "" : "p.") + (a === b ? String(a) : `${a}-${b}`);
  return `낸 것 ${cov.ranges.map(f).join("·")}${cov.missing.length ? ` · 남은 것 ${cov.missing.map(f).join("·")}` : " · 다 덮음"}`;
}
/** 지금 상태와 새 상태를 합친다 — done 은 검사로 안 내려간다 · skip 은 검사로 안 바뀐다 */
export function merge(prev, next) {
  if (!next) return prev ?? null;
  if (prev === "done" || prev === "skip") return prev;
  return next;
}
/** 마감 때 메모로 대신한 교재의 오늘 학습 소단원 — 조각이 아닌 것만 done, 조각은 doing (확정-㊳ · 검사-⑭) */
export function memoDone(items) {
  const out = new Map();
  for (const it of items) { if (!it.unit_id || it.slot !== "class" || it.off) continue; const s = it.range_note ? "doing" : "done"; const p = out.get(it.unit_id); out.set(it.unit_id, p === "done" ? "done" : s); }
  return out;
}
/** 대단원 요약 — 끝냄 n/m · 건너뜀 k · 지금(안 끝난 첫 대단원) */
export function chapterSummary(units, progress) {
  const st = new Map(progress.map((p) => [p.unit_id, p.status]));
  const by = new Map();
  for (const u of units) { if (!by.has(u.chapter)) by.set(u.chapter, { chapter: u.chapter, total: 0, done: 0, skip: 0, doing: 0, units: [] }); const c = by.get(u.chapter); c.total++; const s = st.get(u.id) ?? "none"; if (s === "done") c.done++; else if (s === "skip") c.skip++; else if (s === "doing") c.doing++; c.units.push({ ...u, status: s }); }
  const chapters = [...by.values()];
  const now = chapters.find((c) => c.done + c.skip < c.total) ?? null;
  return { chapters, now: now?.chapter ?? null, finished: chapters.filter((c) => c.total > 0 && c.done + c.skip === c.total).length };
}
