/** 대시보드 판단 한 벌(순수, 목업 17) — 빵꾸 막이(오늘 아이의 교재가 오늘 0줄로 나갈 까닭) · 날짜 글 · D-day · 시험 줄 · 클래스카드 수신 · 하루 정리 · 「어제 21:40」.
 *  까닭 셋은 깔기(routine-plan.js planBook)와 같은 판단이다 — 루틴 줄 없음 · 회차 없음 · 안 한 소단원 없음. 세는 것(안 한 소단원 수)은 SQL v2.todo_counts(0114) */
import { weekdayName, seoulTime } from "./day-plan.js";
import { stopOn } from "./routine-plan.js";
export const GAP = Object.freeze({ no_routine: "루틴 없음", no_round: "회차 없음", no_units: "남은 소단원 없음", cursor_stuck: "커서 잠김" });   // cursor_stuck: 5단계-①(목업 17 「3주째 CHAPTER 5에 서 있습니다」 · 규칙 dash.cursor_stuck_days)
const KIND_NAME = Object.freeze({ regular: "정규", special: "특강", makeup: "보강" });
/** 두 날짜 글자 사이 날수(b − a) — 시간대와 무관(UTC 자정끼리) */
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
export const dateLabel = (date) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${weekdayName(date)}`;
export const md = (date) => (date ? `${Number(String(date).slice(5, 7))}/${Number(String(date).slice(8, 10))}` : "");
/** 반 한 줄 — 「매일 5:00 리허설 17:00–18:30」 · 별명이 없으면 갈래 이름. 오늘 수업(01)의 알약과 같은 글 */
export const classLabel = (c) => `${c.nickname || KIND_NAME[c.kind] || c.kind} ${c.start}${c.end ? `–${c.end}` : ""}`;
/** ISO 시각의 서울 날짜 글자 */
export const seoulDate = (ts) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
/** 「오늘 21:40」 · 「어제 21:40」 · 「9/3 21:40」 */
export function whenText(ts, today) { if (!ts) return ""; const d = seoulDate(ts), n = daysBetween(d, today); return `${n === 0 ? "오늘" : n === 1 ? "어제" : md(d)} ${seoulTime(ts)}`; }
/** 오늘 아이들의 교재마다 — 진행중인데 오늘 0줄로 나갈 까닭 하나(먼저 걸리는 것). routines = v2.routine_areas(0114): student_id 있으면 그 아이의 학생 루틴, 없으면 영역 루틴(확정-㉒) */
export function bookGaps({ books = [], routines = [], todo = [], date, rules = {} }) {
  const stuckDays = Number(rules["dash.cursor_stuck_days"] ?? 21), meta = new Map(todo.map((t) => [`${t.student_id}|${t.book_id}`, t]));
  const mine = new Set(routines.filter((r) => r.student_id && !r.book_id).map((r) => `${r.student_id}|${r.area}`));   // 학생 루틴이 있는 (아이, 영역)
  const mineBook = new Set(routines.filter((r) => r.student_id && r.book_id).map((r) => `${r.student_id}|${r.book_id}`));   // 「이 교재만 다르게」 줄이 있는 (아이, 교재) — 4단계-5
  const areas = new Set(routines.filter((r) => !r.student_id).map((r) => r.area));                     // 영역 루틴이 있는 영역
  const left = new Map(todo.map((t) => [`${t.student_id}|${t.book_id}`, t.n]));
  const out = [];
  for (const b of books) {
    if (stopOn(b, date) !== "running") continue;   // 원장님이 멈춘 교재는 빵꾸가 아니다
    const area = b.books?.area ?? null;
    const m = meta.get(`${b.student_id}|${b.book_id}`), last = m?.last_mark_on ?? m?.since ?? null, idle = last ? daysBetween(String(last), date) : 0;   // 마지막 진도 표시(없으면 교재 시작)부터 며칠
    const kind = !(mineBook.has(`${b.student_id}|${b.book_id}`) || mine.has(`${b.student_id}|${area}`) || areas.has(area)) ? "no_routine" : !(b.per_session > 0) ? "no_round" : (left.get(`${b.student_id}|${b.book_id}`) ?? 0) === 0 ? "no_units" : stuckDays > 0 && idle >= stuckDays ? "cursor_stuck" : null;
    if (kind) out.push({ student_id: b.student_id, book_id: b.book_id, book: b.books?.name ?? "", area, kind, tag: GAP[kind], days: kind === "cursor_stuck" ? idle : 0 });
  }
  return out;
}
export const gapText = (g) => g.kind === "no_routine" ? `${g.area} 영역 루틴이 아직 안 만들어졌습니다` : g.kind === "no_round" ? "배정할 때 회차(한 수업에 몇 덩어리)를 안 정하고 넘어갔습니다" : g.kind === "cursor_stuck" ? `${Math.floor(g.days / 7)}주째 진도가 안 움직였습니다 — 소단원 하나가 ○을 못 받아 다음이 안 열립니다` : "안 한 소단원이 없습니다 — 다음 회독을 열거나 새 교재를 배정해야 합니다";
/** 「이 영역 교재 N권이 다 멈춥니다」 — 루틴 없음일 때 같은 영역의 오늘 교재 수 */
export const areaCount = (g, books) => (g.kind === "no_routine" ? books.filter((b) => b.books?.area === g.area).length : 0);
export function gapSummary(gaps, studentIds) { const bad = new Set(gaps.map((g) => g.student_id)); return { bad: bad.size, ok: studentIds.filter((id) => !bad.has(id)).length }; }
/** D-45 · D-day · 지난 날은 null */
export function dday(today, on) { if (!on) return null; const n = daysBetween(today, on); return n < 0 ? null : n === 0 ? "D-day" : `D-${n}`; }
/** 시험 줄 — 학교 시험의 영어일(없으면 기간 시작)이 오늘부터 horizon 일 안이면 「신정중 2학기 중간 D-45」 가까운 차례. 아이들 학교 중 그런 시험이 없는 학교는 「영어일 없음」(06 에 넣어야 루틴이 선다) */
export function examLines({ exams = [], schools = [], today, horizon = 60 }) {
  const soon = exams.map((e) => ({ ...e, on: e.english_on ?? e.term_from ?? null })).filter((e) => (e.state ?? "active") === "active" && e.on)
    .map((e) => ({ ...e, d: daysBetween(today, e.on) })).filter((e) => e.d >= 0 && e.d <= horizon).sort((a, b) => a.d - b.d);
  const covered = new Set(soon.map((e) => e.school_id));
  const missing = [...new Map(schools.filter((s) => s?.id && !covered.has(s.id)).map((s) => [s.id, s])).values()];
  return { soon: soon.map((e) => ({ id: e.id, school_id: e.school_id, text: `${e.schools?.name ?? ""} ${e.name} ${dday(today, e.on)}`.trim() })), missing };
}
/** 클래스카드 수신 — 기록 없음 · N일째 없음(2일부터) · 정상 */
export function ccText(lastAt, today) {
  if (!lastAt) return { bad: true, text: "클래스카드 수신 기록이 없습니다", sub: "확장이 아직 안 붙었거나 멈췄습니다" };
  const n = daysBetween(seoulDate(lastAt), today), last = `마지막 ${md(seoulDate(lastAt))} ${seoulTime(lastAt)}`;
  return n >= 2 ? { bad: true, text: `클래스카드 수신이 ${n}일째 없습니다`, sub: `${last} · 확장이 멈췄을 수 있습니다` } : { bad: false, text: "클래스카드 수신 정상", sub: last };
}
/** 하루 정리(큐) — 한 번도 안 돎 · 오늘 돎 · 오늘 아직(새벽 4시 전이면 아직 때가 아니다) · 실패로 남은 일 */
export function queueText(ops, today, hour = 12) {
  const ran = ops?.queue_ran_on ?? null, fail = ops?.queue_failed ?? 0, wait = ops?.queue_waiting ?? 0;
  const late = ran !== today && hour >= 4;
  const text = !ran ? "하루 정리가 한 번도 안 돌았습니다" : ran === today ? "하루 정리가 오늘 돌았습니다" : `하루 정리가 오늘 아직 안 돌았습니다 — 마지막 ${md(ran)}`;
  return { bad: !ran || late || fail > 0, text, sub: fail > 0 ? `실패로 남은 일 ${fail} · 기다리는 일 ${wait}` : `기다리는 일 ${wait}` };
}
/** 진도 체크 열림 띠(확정-㊶) — 열려 있으면 「N일째 열려 있습니다」 + 확인 안 한 것 · ❗. 닫혀 있어도 확인 안 한 것·❗ 가 있으면 띄운다 */
export function progressBand(ops, today) {
  const pending = Number(ops?.progress_pending ?? 0), flags = Number(ops?.progress_flags ?? 0), open = Boolean(ops?.progress_open);
  const days = open && ops?.progress_opened_on ? daysBetween(String(ops.progress_opened_on), today) + 1 : 0;
  const tail = [pending ? `아이가 찍은 것 ${pending}` : null, flags ? `❗ ${flags}` : null].filter(Boolean).join(" · ");
  if (open) return { show: true, open, days, pending, flags, text: `✎ 진도 체크가 ${days}일째 열려 있습니다`, small: tail || "아이가 찍으면 여기 셉니다 — 닫으려면 설정 → 진도 체크" };
  if (pending || flags) return { show: true, open, days: 0, pending, flags, text: "✎ 진도 체크 — 볼 것이 있습니다", small: tail };
  return { show: false, open, days: 0, pending, flags, text: "", small: "" };
}
/** 다음 달 일정 확정 줄(4단계-3b · ㉚ 9/7) — 풀렸으면(휴강이 들어옴) 날짜와 상관없이 · 아직이면 규칙 schedule.confirm_from_day(20)일부터 · 다 찍혔거나 반이 없으면 안 띄운다. cn = dash_ops.confirm_next */
export function confirmLine(cn, today) {
  const all = Number(cn?.all ?? 0), ok = Number(cn?.ok ?? 0), undone = Number(cn?.undone ?? 0);
  if (!cn?.ym || !all) return { show: false };
  const m = Number(String(cn.ym).slice(5, 7)), day = Number(String(today).slice(8, 10)), from = Number(cn.from_day ?? 20);
  if (undone > 0) return { show: true, bad: true, ym: cn.ym, text: `📅 ${m}월 일정 확정이 풀렸습니다 — 휴강이 들어왔습니다`, small: "다시 확정하면 학부모에게 알림이 갑니다" };
  if (ok >= all || day < from) return { show: false };
  return { show: true, bad: true, ym: cn.ym, text: `📅 ${m}월 일정 아직 확정 안 함 — 반 ${all} 중 ${all - ok}`, small: `${from}일부터 띄웁니다 · 확정하면 학부모에게 알림이 갑니다` };
}
/** 메모로만 진도가 올라간 교재(5단계-① · 목업 02b 「⚠️ 이 교재 3회 연속 메모로만 갔습니다 — 교재를 안 폈는데 진도가 올라갑니다」) — 살아 있는(멈추지 않은) 교재 중 memo_streak 가 규칙 dash.memo_only_streak(3) 이상인 것. todo = v2.todo_counts */
export function memoCalls({ books = [], todo = [], rules = {}, date }) {
  const need = Number(rules["dash.memo_only_streak"] ?? 3); if (!(need > 0)) return [];
  const meta = new Map(todo.map((t) => [`${t.student_id}|${t.book_id}`, t]));
  return books.filter((b) => stopOn(b, date) === "running").map((b) => ({ b, t: meta.get(`${b.student_id}|${b.book_id}`) })).filter(({ t }) => Number(t?.memo_streak ?? 0) >= need)
    .map(({ b, t }) => ({ student_id: b.student_id, book_id: b.book_id, book: b.books?.name ?? "", streak: Number(t.memo_streak), text: `${t.memo_streak}회 연속 메모로만 진도가 올라갔습니다 — 교재를 안 폈는데 진도가 올라갑니다. 진도 체크에서 봐 주세요` }));
}
