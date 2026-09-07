/** 시험 판단 중 순수한 것(DB 없음) — 화면(클라이언트)과 lib/quiz.js 가 같이 쓴다. 통과 판정은 여기 없다 — SQL 한 곳(v2.quiz_passed → 계산 칸 passed·pct) */
export const KIND = Object.freeze([["word", "단어", "🔤"], ["sentence", "문장", "🗣"]]);
export const SOURCE = Object.freeze([["book", "교재"], ["prep", "내신"], ["manual", "직접"]]);
export const RETEST_TAG = "재시험이 남음";
export const S_WAY = Object.freeze([["dictation", "받아쓰기"], ["record", "녹음"]]);   // 문장 시험 방식(0040 quiz_style.s_way — 0041 이 구두를 걷었다 · 목업의 「구두」는 옛 말)
/** 내신 범위 한 줄(prep_scope) — 「교재 · CH5 › 5-2」 또는 직접 적은 글. 04·06b 가 넣은 범위를 다음 시간 시험이 고른다(5단계-③) */
export const scopeLabel = (sc, examName = "") => `${examName ? examName + " " : ""}내신 범위 — ${sc?.books?.name ? `${sc.books.name}${sc.units ? ` · ${sc.units.chapter} › ${sc.units.short}` : ""}` : sc?.free_note || "범위 없음"}`;
/** 방식 고치기(학생 × 교재 × 회독 × 갈래 — 이 아이만) 양식 읽기 — 단어는 네 비율 합 100 · 문장은 방식 하나 · 통과선 0~100. DB 제약(style_pct·style_sentence)과 같은 문 */
export function parseStyle(kind, f = {}) {
  const num = (k, def = 0) => { const v = String(f[k] ?? "").trim(); if (v === "") return def; const n = Number(v); if (!Number.isInteger(n) || n < 0) throw new Error(`숫자가 아닙니다: ${k}`); return n; };
  const cut = num("cut_pct", 90); if (cut > 100) throw new Error("통과선은 0~100");
  if (kind === "sentence") { const w = String(f.s_way ?? "dictation"); if (!S_WAY.some(([k]) => k === w)) throw new Error(`문장 시험 방식이 아닙니다: ${w}`); return { s_way: w, cut_pct: cut, mc_meaning: 0, sa_meaning: 0, mc_word: 0, sa_word: 0, first_hint: false, units_per: null }; }
  const o = { mc_meaning: num("mc_meaning"), sa_meaning: num("sa_meaning"), mc_word: num("mc_word"), sa_word: num("sa_word"), first_hint: f.first_hint === true || f.first_hint === "on" || f.first_hint === "true", units_per: f.units_per ? num("units_per") : null, s_way: null, cut_pct: cut };
  if (o.mc_meaning + o.sa_meaning + o.mc_word + o.sa_word !== 100) throw new Error("네 비율의 합이 100 이어야 합니다 (객관식 뜻 · 주관식 뜻 · 객관식 영어 · 주관식 영어)");
  return o;
}
/** 아이 하나의 시험을 오늘 화면 자리로 — today: 볼 것·본 것·재시험 / next: 오늘 낸 다음 시간 시험(재시험은 아님) */
export function splitQuizzes(rows, date) {
  const next = rows.filter((q) => q.state === "planned" && !q.retry_of && q.assigned_on === date);
  const today = rows.filter((q) => !next.includes(q));
  return { today, next };
}
export const scopeText = (q) => q.source === "book" ? `${q.books?.name ?? "교재"}${q.units ? ` · ${q.units.chapter} › ${q.units.short}` : ""}` : q.source === "prep" ? scopeLabel(q.prep_scope, q.prep_scope?.exams?.name ?? "") : q.free_note || "범위 없음";
/** 늦귀가 사유 꼬리표 — 「단어 재시험이 남음 — 범위 83%」. 떼는 쪽은 머리(「단어 재시험이 남음」)로 찾는다 */
export const retestTag = (q) => `${KIND.find(([k]) => k === q.kind)?.[1] ?? ""} ${RETEST_TAG} — ${scopeText(q)}${q.pct != null ? ` ${q.pct}%` : ""}`;
/** 🔤 시험 카드 자리(0143 students.quiz_pos · (가)-①) — 아이마다: start 시작하자마자(기본 · 카드가 맨 위) · end 다 끝내고(학습·숙제 아래). 정하는 자리는 루틴 11 아이 머리 · 읽는 자리는 오늘 01 줄(목업 01 「자리가 아이마다 다릅니다」). 모르면 시작하자마자 */
export const QUIZ_POS = Object.freeze([["start", "시작하자마자"], ["end", "다 끝내고"]]);
export const quizPosOf = (student) => QUIZ_POS.some(([k]) => k === student?.quiz_pos) ? student.quiz_pos : QUIZ_POS[0][0];
export const quizPosEnd = (student) => quizPosOf(student) === "end";   // 「다 끝내고」인 아이 — 01 에서 카드가 학습·숙제 아래
export const quizPosName = (k) => QUIZ_POS.find(([x]) => x === k)?.[1] ?? QUIZ_POS[0][1];
