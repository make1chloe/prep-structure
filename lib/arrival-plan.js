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
/** 주소 견줌 열쇠 — IPv4 는 그대로, IPv6 는 앞 4덩어리(/64). ::ffff: 꼴은 v4 로 */
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
export function classSteps(items = []) {
  let opened = false;
  return [...items].sort((a, b) => a.sort - b.sort).map((it) => { const done = Boolean(it.said_done_at); const state = done ? "done" : opened ? "locked" : "now"; if (!done) opened = true; return { ...it, state }; });
}
