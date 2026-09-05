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
