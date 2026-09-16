/** 등원·하원 판단 한 벌(순수, 목업 07 🕘 · 9/5 ⑬) — 걸음 셋(핸드폰·출석·숙제, 0078) + 집에 가요(4, 0083) · 도착 시각은 가장 이른 등원 걸음(저장하지 않고 세어 나온다) ·
 *  지각 분은 반 시작과 견줘 세어 나온다(원칙-5, 유예 분은 v2.integration arrival.graceMin) · 학원 회선 판정(IPv4 그대로 · IPv6 는 앞 4덩어리 = /64) · 반이 둘이면 아이가 고른다(답 ⑫) ·
 *  「앞으로」 줄(결석 예정·보강 · 지각 예정) · 학원 줄의 차례(0084 ⑱: 아이가 하나 끝내면 다음이 열린다) */
import { seoulTime, weekdayName } from "./day-plan.js";
import { makeupText } from "./plan-plan.js";
import { md } from "./dash-plan.js";
export const STEPS = Object.freeze([[1, "핸드폰 냈어요"], [2, "출석"], [3, "숙제 냈어요"]]);
export const LEAVE = 4;
export const stepName = (n) => (n === LEAVE ? "집에 가요" : STEPS.find(([k]) => k === n)?.[1] ?? `걸음 ${n}`);
/** 오늘 찍은 걸음들 → 찍은 걸음 · 도착(가장 이른 등원 걸음) · 하원 */
export function arrivalState(rows = []) {
  const done = new Set(rows.map((r) => Number(r.step)));
  const ins = rows.filter((r) => Number(r.step) !== LEAVE && r.at).map((r) => String(r.at)).sort();
  const out = rows.find((r) => Number(r.step) === LEAVE)?.at ?? null;
  return { done, arrivedAt: ins[0] ?? null, leftAt: out, arrived: ins.length > 0, left: Boolean(out) };
}
const mins = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** 지각 분 — 도착이 반 시작보다 유예 분 넘게 늦으면 그 분, 아니면 0. 반 시작을 모르면 0 */
export function lateMinutes(arrivedIso, startHHMM, graceMin = 0) { const a = arrivedIso ? mins(seoulTime(arrivedIso)) : null, s = mins(startHHMM); if (a === null || s === null) return 0; const d = a - s; return d > (Number(graceMin) || 0) ? d : 0; }
/** 주소 견줌 키 · IPv4 는 그대로, IPv6 는 앞 4덩어리(/64). ::ffff: 꼴은 v4 로 */
export function ipKey(ip) { let s = String(ip ?? "").trim().toLowerCase(); if (s.startsWith("::ffff:")) s = s.slice(7); return s.includes(":") ? s.split(":").slice(0, 4).join(":") : s; }
export const ipAllowed = (ip, list = []) => Boolean(ip) && (list ?? []).some((x) => ipKey(x) === ipKey(ip));
/** 요청의 주소 — x-forwarded-for 의 첫 것, 없으면 x-real-ip, 없으면 null(로컬). Vercel 은 늘 x-forwarded-for 를 준다 */
export function clientIp(get) { const xff = get("x-forwarded-for"); if (xff) return String(xff).split(",")[0].trim(); const real = get("x-real-ip"); return real ? String(real).trim() : null; }
/** 오늘 어느 반에 등원하나 — 하나면 그것 · 둘이면 아이가 고른다(답 ⑫) · 반이 없고 보강이면 보강(반 없음) · 아무것도 없으면 none */
export function classChoice(classes = []) {
  const real = classes.filter((c) => c.kind !== "makeup" && c.id);
  if (real.length === 1) return { pick: false, classId: real[0].id, start: real[0].start ?? null };
  if (real.length > 1) return { pick: true, classId: null, start: null, options: real.map((c) => ({ id: c.id, name: c.nickname || c.kind, start: c.start })) };
  const mk = classes.find((c) => c.kind === "makeup");
  return mk ? { pick: false, classId: null, start: mk.start ?? null, makeup: true } : { pick: false, classId: null, start: null, none: true };
}
/** 「앞으로」 — 결석 예정(보강 잡힘/안 잡음) · 지각 예정. 오늘부터, 날짜 차례 */
export function futureLines({ absences = [], lates = [], today }) {
  const a = absences.filter((x) => x.of_date >= today && x.state !== "cancelled").map((x) => ({ date: x.of_date, text: `${md(x.of_date)} ${weekdayName(x.of_date)} 결석 예정 · ${makeupText(x)}` }));
  const l = lates.filter((x) => x.date >= today && !x.cancelled_at).map((x) => ({ date: x.date, text: `${md(x.date)} ${weekdayName(x.date)} ${x.minutes}분 지각 예정` }));
  return [...a, ...l].sort((p, q) => String(p.date).localeCompare(String(q.date)));
}
/** 학원 줄의 차례 — 끝낸 것 done · 지금 할 것 now(첫 안 끝낸 줄) · 그 뒤 locked */
/** 숙제 줄 — 아무 때나 누른다. 다만 🔒(gate_prev) 줄은 바로 앞 숙제 줄을 끝내야 열린다(확정-㉒ — 잠금은 줄 사이에만, 모든 줄이 아니다 · 4단계-5). 학원 줄은 ⑰ 대로 늘 차례대로(classSteps) */
export function homeSteps(items = []) {
  const sorted = [...items].sort((a, b) => a.sort - b.sort);
  const key = (it) => it.item_id ?? it.id;   // 「앞엣것」은 앞 항목(루틴 줄) — 소단원마다 줄이 서도 같은 항목끼리는 서로 안 잠근다 · 손으로 더한 줄은 저마다 하나
  const groups = []; for (const it of sorted) { let g = groups.find((x) => x.key === key(it)); if (!g) { g = { key: key(it), rows: [] }; groups.push(g); } g.rows.push(it); }
  return sorted.map((it) => { const done = Boolean(it.said_done_at); const prev = groups[groups.findIndex((g) => g.key === key(it)) - 1]; const locked = !done && Boolean(it.gate_prev) && Boolean(prev) && prev.rows.some((r) => !r.said_done_at); return { ...it, state: done ? "done" : locked ? "locked" : "now" }; });
}
export function classSteps(items = []) {
  let opened = false;
  return [...items].sort((a, b) => a.sort - b.sort).map((it) => { const done = Boolean(it.said_done_at); const state = done ? "done" : opened ? "locked" : "now"; if (!done) opened = true; return { ...it, state, running: Boolean(it.started_at) && !done }; });   // (어35) running · 시작했지만 안 끝냄(타이머가 돈다)
}
/** (어35) 학원 줄 타이머 글(원장님 9/15 「학생페이지 타이머 짓는다」) · 하는 중이면 「▶ m:ss」(아이 화면이 1초마다 다시 센다) · 끝났으면 「⏱ N분」(끝 − 시작 · 1분 미만은 1분 · 끝은 ended_at, 없으면 said_done_at) · 시작 안 했으면 null · 07 · 01 이 같은 글 */
export function timerText(it, now = Date.now()) {
  const s = it?.started_at ? new Date(it.started_at).getTime() : NaN; if (Number.isNaN(s)) return null;
  const end = it.ended_at ?? it.said_done_at ?? null;
  if (end) { const e = new Date(end).getTime(); return `⏱ ${Math.max(1, Math.round((e - s) / 60000))}분`; }
  const sec = Math.max(0, Math.floor((now - s) / 1000)); return `▶ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** (어48) 출결 곁의 시각 · 도착(가장 이른 등원 걸음)·하원과 **누가 찍었나**. 원장님 2026-09-16 「출석, 지각, 하원은 시간이 기록되게해 1차적으로 학생어플에서 눌렀으면 그걸 기준으로 삼고, 내가 다시 눌렀으면 내가 누른걸로 정정」
 *  아이 앱이 찍은 줄은 그대로 두고(출결을 눌러도 안 덮는다) 원장님이 시각을 고치면 그때 staff 로 바뀐다 */
export const STAMP_NAME = Object.freeze({ student: "앱", staff: "원장" });
export function arrivalTimes(rows = []) {
  const who = (r) => (r?.stamped_by === "staff" ? "staff" : "student");
  const one = (r) => (r && r.at ? { at: seoulTime(r.at), by: who(r), name: STAMP_NAME[who(r)] } : null);
  const ins = rows.filter((r) => Number(r.step) !== LEAVE && r.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { in: one(ins[0] ?? null), out: one(rows.find((r) => Number(r.step) === LEAVE && r.at) ?? null) };
}

/** (어55b) 취소한 등원·하원 줄을 빼고 읽는다 — 읽는 자리 넷(01 · 07 · 09 · 달력)이 이것 하나를 쓴다(원칙-1).
 *  ⚠️ **0170 이 실 DB 에 아직 안 들어갔으면 undone_at 칸이 없어 조회가 통째로 깨진다**(2026-09-16 학생 화면이 그랬다 — 붙여넣기 SQL 보다 코드가 먼저 배포됐다).
 *  그럴 때는 **거르지 않고 그대로 읽는다** — 화면은 서고, 취소 기능만 잠깐 안 먹는다. SQL 이 들어가는 순간 저절로 걸린다.
 *  make 는 **조회를 새로 짓는 함수**다(조회는 한 번 쓰면 다시 못 쓴다). */
export async function liveArrival(make) {
  const r = await make().is("undone_at", null);
  return /undone_at/.test(r?.error?.message ?? "") ? await make() : r;
}
