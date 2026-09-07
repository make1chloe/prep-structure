/** 늦귀가 판단 한 벌(순수) — 예상 귀가(약속)와 실제 하원의 차이 · 되풀이 띠 · 마감 전에 한 번 묻는 것(확정-⑭ · 확정-64). 화면(브라우저)과 검사가 같이 쓴다.
 *  셈(며칠 안에 몇 번 · 실제 하원)은 SQL(v2.late_states, 0113)이 하고 여기는 문구와 판단만 — 차이는 저장하지 않고 세어 나온다(원칙-5) */
export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");
const mins = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** 실제 − 예상(분). 하나라도 없으면 null. 자정을 넘는 하원은 없다고 본다 — 학원은 밤 11시 전에 닫는다 */
export const diffMinutes = (untilAt, leftAt) => { const a = mins(untilAt), b = mins(leftAt); return a === null || b === null ? null : b - a; };
/** 「예상보다 25분 늦게」 · 「예상보다 10분 일찍」 · 「예상대로」 */
export const diffText = (d) => (d === null || d === undefined ? "" : d === 0 ? "예상대로" : d > 0 ? `예상보다 ${d}분 늦게` : `예상보다 ${-d}분 일찍`);
/** 실제 하원 줄 — 찍혔으면 「실제 하원 22:05 · 예상보다 25분 늦게」(약속이 없었으면 시각만), 아직이면 null */
export function leftText(late, leftAt) { if (!leftAt) return null; const d = diffMinutes(late?.until_at, leftAt); return `실제 하원 ${hhmm(leftAt)}` + (d === null ? "" : ` · ${diffText(d)}`); }
/** 되풀이 띠 — SQL 이 센 것(stayed · window_days · repeat_at · ask)을 말로. 「3주 안 3번째 남습니다 — 숙제량을 볼까요?」. 묻지 않을 때 null */
export function repeatBand(stay) {
  if (!stay?.ask) return null;
  const win = stay.window_days % 7 === 0 ? `${stay.window_days / 7}주` : `${stay.window_days}일`;
  return { title: `${win} 안 ${stay.stayed}번째 남습니다 — 숙제량을 볼까요?`, days: stay.stayed_days ?? "" };
}
/** 안 보낸 채인가 — 예상 귀가는 적었는데 학부모에게 안 보냈다(확정-⑭ 「안 보내면 학부모는 모른 채 기다린다」) */
export const unsentLate = (late) => Boolean(late?.until_at && !late?.sent_at);
/** 마감 전에 한 번 묻는 것 — AI 초안 그대로(확정-64) · 안 보낸 늦귀가(확정-⑭). 둘 다 걸리면 한 상자에 같이 묻는다(두 번 안 묻는다). 막지 않는다. 없으면 [] */
export function askBeforeClose({ same = false, late = null }) { const a = []; if (same) a.push("same"); if (unsentLate(late)) a.push("late"); return a; }

/** 3b 사유 칩(목업 01 「✓ 워크북 미제출 · ✓ 반성문 — 오늘 남아서」) — 그날 판에서 사유 후보를 세운다: 검사에 ✕(missing)인 숙제 항목 · 오늘 남아서 쓰는 반성문.
 *  원본은 사유 한 줄(확정-㊿) — 칩은 그 글에 조각을 넣고 빼는 손일 뿐. on = 글에 그 조각이 들어 있다. 미통과 재시험은 SQL 이 사유에 저절로 적어 칩이 아니다 */
export function reasonChips({ checks = [], warn = null, reason = "" } = {}) {
  const out = [];
  for (const c of checks ?? []) if (c?.status === "missing") out.push({ key: `miss:${c.id}`, text: `${c.range_note || c.learn_items?.name || "숙제"} 미제출` });   // 검사 카드가 보이는 이름 그대로(range_note 먼저)
  if (warn?.today_disposal === "stay") out.push({ key: "refl", text: "반성문 — 오늘 남아서", fixed: true });   // 처분 세그먼트(reflect)가 사유에 적는다 — 칩은 보여만 준다
  const r = String(reason ?? "");
  const seen = new Set();
  return out.filter((c) => (seen.has(c.text) ? false : seen.add(c.text))).map((c) => ({ ...c, on: r.includes(c.text) }));
}
/** 칩을 누르면 사유 글에 조각을 넣거나 뺀다 — 조각은 「 · 」 로 잇는다. 원장님이 손으로 고친 글은 안 건드린다(조각만 글자 그대로 찾아 뺀다 — 조각 안에 「 · 」가 있어도(범위 글) 된다) */
export function toggleReason(reason, text) {
  const r = String(reason ?? "").trim(), t = String(text ?? "").trim();
  if (!t) return r;
  const i = r.indexOf(t);
  if (i < 0) return r ? `${r} · ${t}` : t;
  return (r.slice(0, i) + r.slice(i + t.length)).replace(/( · )+/g, " · ").replace(/^ · | · $/g, "").trim();
}
/** 「평소 21:40」 — 반이 끝나는 시각(목업 01 3b 「평소 9:40 → 10:20」). 반 끝 시각이 없으면 null */
export const usualText = (end) => (end ? `평소 ${hhmm(end)}` : null);
/** 3b 「남」 줄(0141) — 판의 stay 줄을 글로: 이름(항목 이름 › 단원 › 적은 글) · 「숙제에서 옮겨옴」(조각) · 상태(done 다 함 · missing 넘김 · 아직) */
export function stayRows(items = []) {
  return (items ?? []).filter((i) => i.slot === "stay").sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((i) => ({
    id: i.id, text: i.range_note || i.learn_items?.name || i.units?.label || i.units?.short || "(이름 없음)",
    sub: [i.units?.chapter, i.units?.short].filter(Boolean).join(" › ") || "", from: i.carry_of ? "숙제에서 옮겨옴" : null,
    state: i.status === "done" ? "done" : i.status === "missing" ? "missing" : "open" }));
}
/** 「남 2 · 다 함 1 · 못 하고 넘김 1」 */
export function stayCounts(rows = []) { const c = { total: rows.length, done: rows.filter((r) => r.state === "done").length, missing: rows.filter((r) => r.state === "missing").length }; return { ...c, open: c.total - c.done - c.missing }; }
