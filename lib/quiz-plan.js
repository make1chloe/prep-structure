/** 시험 판단 중 순수한 것(DB 없음) — 화면(클라이언트)과 lib/quiz.js 가 같이 쓴다. 통과 판정은 여기 없다 — SQL 한 곳(v2.quiz_passed → 계산 칸 passed·pct) */
export const KIND = Object.freeze([["word", "단어", "🔤"], ["sentence", "문장", "🗣"]]);
export const SOURCE = Object.freeze([["book", "교재"], ["prep", "내신"], ["manual", "직접"]]);
export const RETEST_TAG = "재시험이 남음";
/** 아이 하나의 시험을 오늘 화면 자리로 — today: 볼 것·본 것·재시험 / next: 오늘 낸 다음 시간 시험(재시험은 아님) */
export function splitQuizzes(rows, date) {
  const next = rows.filter((q) => q.state === "planned" && !q.retry_of && q.assigned_on === date);
  const today = rows.filter((q) => !next.includes(q));
  return { today, next };
}
export const scopeText = (q) => q.source === "book" ? `${q.books?.name ?? "교재"}${q.units ? ` · ${q.units.chapter} › ${q.units.short}` : ""}` : q.free_note || "범위 없음";
/** 늦귀가 사유 꼬리표 — 「단어 재시험이 남음 — 범위 83%」. 떼는 쪽은 머리(「단어 재시험이 남음」)로 찾는다 */
export const retestTag = (q) => `${KIND.find(([k]) => k === q.kind)?.[1] ?? ""} ${RETEST_TAG} — ${scopeText(q)}${q.pct != null ? ` ${q.pct}%` : ""}`;
