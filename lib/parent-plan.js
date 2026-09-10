/** 학부모 화면 판단 한 벌(순수, 목업 09) — 오늘 수업 꼬리표(시험 N/N · 숙제 %) · 오늘 늦귀가 안내 · 보낸 것 줄 · 등원·하원 한 줄. 세는 것은 세어 나온다(원칙-5). 빈 카드는 숨긴다(확정-⑮) */
import { seoulTime } from "./day-plan.js";
import { hhmm } from "./late-plan.js";
import { md } from "./dash-plan.js";
import { KIND as QKIND, scopeText } from "./quiz-plan.js";
import { arrivalState } from "./arrival-plan.js";
import { won } from "./fee-plan.js";
import { logName } from "./send-plan.js";
/** 숙제 검사 결과 — ○ 의 비율(%). 검사한 줄이 없으면 null */
export function homeworkPct(checkItems = []) { const seen = checkItems.filter((i) => i.status && i.status !== "none"); if (!seen.length) return null; return Math.round((seen.filter((i) => i.status === "done").length / seen.length) * 100); }
/** 오늘 수업 카드의 꼬리표 — 「단어 17/20」 「숙제 83%」 */
export function sheetTags(sheet, quizzes = []) {
  const tags = [];
  for (const q of quizzes.filter((q) => q.taken_on && q.taken_on === sheet?.date && q.total)) tags.push({ text: `${QKIND.find(([k]) => k === q.kind)?.[1] ?? q.kind} ${q.total - (q.wrong ?? 0)}/${q.total}`, on: Boolean(q.passed) });
  const pct = homeworkPct(sheet?.check ?? []);
  if (pct != null) tags.push({ text: `숙제 ${pct}%`, on: pct >= 80 });
  return tags;
}
/** 🌙 오늘 늦게 갑니다 — 보낸 것만(late_for_family). 실제 하원이 찍히면 「HH:MM 에 갔습니다」 */
export function todayLate(rows = [], today) {
  const r = rows.find((x) => x.on_date === today);
  if (!r) return null;
  return { until: hhmm(r.until_at), reason: r.reason ?? "", sentAt: r.sent_at ? seoulTime(r.sent_at) : null, left: r.left_at ? hhmm(r.left_at) : null };
}
/** 보낸 것 — 늦귀가 안내들(최근 것부터) */
export const sentLines = (rows = [], today) => [...rows].filter((x) => x.on_date !== today).sort((a, b) => String(b.on_date).localeCompare(String(a.on_date))).slice(0, 5).map((x) => ({ id: x.id, text: `${md(x.on_date)} 늦귀가 안내 — ${hhmm(x.until_at)} 예정${x.left_at ? ` · ${hhmm(x.left_at)} 하원` : ""}`, small: x.reason ?? "" }));
/** 🕘 오늘 — 「정시 등원」 알약과 「5:02 도착 · 하원 아직」 */
export function todayArrival(rows = [], sheet = null) {
  const st = arrivalState(rows);
  if (!st.arrived && !sheet) return null;
  const pill = sheet?.attend === "late" ? "지각" : sheet?.attend === "absent" ? "결석" : st.arrived || sheet ? "정시 등원" : null;
  const text = st.arrived ? `${seoulTime(st.arrivedAt)} 도착 · ${st.left ? `${seoulTime(st.leftAt)} 하원` : "하원 아직"}` : "등원을 아직 안 찍었어요";
  return { pill, text, pillOn: pill === "정시 등원" };
}
/** 📝 다음 시간 시험 줄 — 개수를 정한 것만(확정: 안 정한 시험은 안 보낸다) */
export const nextQuizLines = (quizzes = []) => quizzes.filter((q) => q.total).map((q) => ({ id: q.id, emo: QKIND.find(([k]) => k === q.kind)?.[2] ?? "📝", b: `${QKIND.find(([k]) => k === q.kind)?.[1] ?? q.kind} ${q.total}개`, small: `${scopeText(q)} · 통과 ${q.cut_pct ?? 90}%` }));

/** 💰 이 달 수강료(4단계-2a) — 수납 줄이 있을 때만(원장님이 적은 금액 · 정책 own_payment). 없으면 null → 카드 안 뜸(빈 카드 금지) */
export function feeLine(fee, ym) {
  if (!fee || fee.amount == null) return null;
  const m = Number(String(fee.ym ?? ym).slice(5, 7));
  return { text: `${m}월 수강료 ${won(fee.amount)}`, paid: Boolean(fee.paid_on), pill: fee.paid_on ? `받음 ${md(fee.paid_on)}` : "아직", small: fee.paid_on ? `${md(fee.paid_on)} 받았습니다${fee.method ? ` · ${fee.method}` : ""}` : "입금 뒤 원장님이 확인하면 「받음」으로 바뀝니다" };
}
/** 📨 내게 온 알림 자취(4단계-2a — 학부모 「보낸 것」이 자취를 읽는다) — 실제로 나간 것만(sent_at) · 「M/D 수업 안내 · 읽음/안 읽음」 · 누르면 그 자리로 */
export function noticeLines(notices = []) {
  return (notices ?? []).filter((l) => l.sent_at).map((l) => ({ id: `n:${l.id}`, text: `${md(String(l.sent_at).slice(0, 10))} ${logName(l.kind)}${l.channel === "sms" ? " · 문자" : ""}`, small: l.channel === "sms" ? `문자로 받음${l.to_phone ? ` ${l.to_phone}` : ""}` : l.opened_at ? `읽음 ${hhmm(String(l.opened_at).slice(11, 16))}` : "안 읽음", url: l.url || "/parent" }));   // (커) 문자 자취는 「문자로 받음」(읽음은 모른다)
}
