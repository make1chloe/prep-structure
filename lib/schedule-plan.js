/** 일정 판단 한 벌(순수, 목업 12) — 달력 42칸의 일들 · 반 회차(8회 채우기) · 하루의 줄 · 범례. 정상 수업은 안 띄운다(당연한 것이니까). 세는 것은 세어 나온다(원칙-5) */
import { monthGrid, nextYm, makeupText } from "./plan-plan.js";
import { md } from "./dash-plan.js";
import { weekdayName } from "./day-plan.js";
export { nextYm };
export const W = Object.freeze(["일", "월", "화", "수", "목", "금", "토"]);
/** 일의 갈래 — 칸 안 표시의 차례(휴강 › 결석 › 영어 시험일 › 시험 기간 › 보강 › 지각 › 할 일) · 그림 · 범례 이름 */
export const EVENT = Object.freeze([["hol", "🚫", "휴강"], ["abs", "✕", "결석"], ["exam2", "📝", "영어 시험일"], ["exam", "📝", "시험 기간"], ["mk", "↻", "보강"], ["late", "⏰", "지각"], ["todo", "📋", "할 일"]]);
export const LEGEND = Object.freeze([["abs", "✕", "결석"], ["late", "⏰", "지각"], ["mk", "↻", "보강"], ["exam", "📝", "시험 기간"], ["exam2", "📝", "영어 시험일"], ["todo", "📋", "할 일"], ["hol", "🚫", "휴강"]]);
export const monthTitle = (ym) => `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;
export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");
/** 반 이름 — 별명이 있으면 그것, 없으면 「월·수 17:00」 */
export function classText(c) { const days = (c.weekdays ?? []).map((d) => W[d]).join("·"); return c.nickname ? c.nickname : `${days} ${hhmm(c.start_time)}`.trim(); }
/** 회차 — 요일 × 달 − 휴강 + 반 보강일. 정규는 기준(규칙 schedule.sessions_per_month)과 견주고, 특강은 회차만큼 받는다 */
export function sessionsOf(c, target = 8) {
  const n = Number(c.sessions ?? 0) + Number(c.extra ?? 0);
  if (c.kind === "special") return { n, ok: null, short: 0, text: "특강은 회차만큼 받습니다" };
  const short = Math.max(0, target - n);
  return { n, ok: short === 0, short, text: short === 0 ? `${target}회 채움 ✓` : `⚠️ ${short}회 모자람 — 보강 필요` };
}
const inClass = (row, classId) => !classId || (row.class_ids ?? []).includes(classId);
const liveAbs = (m) => m.of_date && !["cancelled", "done"].includes(m.state);   // 물린 것·끝난 것은 결석 줄이 아니다
const names = (rows) => rows.map((r) => r.name).filter(Boolean).join(", ");
const examOn = (e, date) => e.term_from && e.term_to && e.term_from <= date && date <= e.term_to;
const examTitle = (e) => `${e.school ?? (e.scope === "national" ? "전국" : "")} ${e.name}`.trim();
/** 그날의 일들(칸에 적는 짧은 글) — 반을 고르면 그 반 아이들·그 반(또는 전체) 휴강만 */
export function eventsOf(date, b, classId = null) {
  const out = [];
  for (const h of (b.holidays ?? []).filter((h) => h.date === date && h.state !== "off" && (!classId || !h.class_id || h.class_id === classId))) out.push({ kind: "hol", text: `🚫 휴강${h.reason ? " · " + h.reason : ""}${h.class_id && !classId ? " (반)" : ""}`, id: h.id });
  const abs = (b.makeups ?? []).filter((m) => m.of_date === date && liveAbs(m) && inClass(m, classId));
  if (abs.length) out.push({ kind: "abs", text: `✕ 결석 · ${names(abs)}` });
  for (const e of (b.exams ?? []).filter((e) => e.english_on === date)) out.push({ kind: "exam2", text: `📝 영어 시험일 · ${e.school ?? e.name}`, id: e.id });
  for (const e of (b.exams ?? []).filter((e) => examOn(e, date) && e.english_on !== date)) out.push({ kind: "exam", text: `📝 시험 · ${examTitle(e)}`, id: e.id });
  const mk = (b.makeups ?? []).filter((m) => m.on_date === date && m.state === "set" && inClass(m, classId));
  const classMk = mk.filter((m) => !m.of_date), oneMk = mk.filter((m) => m.of_date);
  if (classMk.length) out.push({ kind: "mk", text: `↻ 보강 · ${classMk[0].reason ?? "8회 채우기"}${classMk[0].at_time ? " " + hhmm(classMk[0].at_time) : ""}` });
  for (const m of oneMk) out.push({ kind: "mk", text: `↻ 보강${m.at_time ? " " + hhmm(m.at_time) : ""} · ${m.name}` });
  for (const l of (b.lates ?? []).filter((l) => l.date === date && inClass(l, classId))) out.push({ kind: "late", text: `⏰ 지각${l.minutes ? " " + l.minutes + "분" : ""} · ${l.name}` });
  for (const t of (b.todos ?? []).filter((t) => t.due_on === date)) out.push({ kind: "todo", text: `📋 ${t.title}${t.name ? " · " + t.name : ""}`, id: t.id });
  const order = EVENT.map(([k]) => k);
  return out.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
}
/** 달력 42칸 — 월요일부터 · 그 달 밖은 out · 오늘 · 고른 날 */
export function monthCells(ym, b, { classId = null, today, sel = null } = {}) {
  return monthGrid(ym).map((c) => ({ ...c, isToday: c.date === today, sel: c.date === sel, events: c.out ? [] : eventsOf(c.date, b, classId) }));
}
/** 고른 날의 줄(목업 12 아래 판) — 결석(아이마다 사유 → 보강 잡힘/안 잡힘) · 지각 · 보강 · 시험(기간 · 영어일 · 출처) · 할 일 · 휴강 */
export function dayRows(date, b, classId = null) {
  const rows = [];
  for (const h of (b.holidays ?? []).filter((h) => h.date === date && h.state !== "off" && (!classId || !h.class_id || h.class_id === classId)))
    rows.push({ kind: "hol", icon: "🚫", title: `휴강${h.class_id ? " · " + (classText((b.classes ?? []).find((c) => c.id === h.class_id) ?? {}) || "반") : " · 전체"}`, small: h.reason ?? "", id: h.id });
  const abs = (b.makeups ?? []).filter((m) => m.of_date === date && liveAbs(m) && inClass(m, classId));
  if (abs.length) rows.push({ kind: "abs", icon: "✕", title: `결석 · ${names(abs)}`, small: abs.map((m) => `${m.name}${m.reason ? " " + m.reason : ""} → ${makeupText(m) || "보강 안 잡힘"}`).join(" · "), items: abs.map((m) => ({ id: m.id, student_id: m.student_id, name: m.name, state: m.state, on_date: m.on_date, at_time: m.at_time })) });
  for (const l of (b.lates ?? []).filter((l) => l.date === date && inClass(l, classId))) rows.push({ kind: "late", icon: "⏰", title: `지각${l.minutes ? " " + l.minutes + "분" : ""} · ${l.name}`, small: l.reason ?? "", id: l.id });
  const mk = (b.makeups ?? []).filter((m) => m.on_date === date && m.state === "set" && inClass(m, classId));
  const classMk = mk.filter((m) => !m.of_date);
  if (classMk.length) rows.push({ kind: "mk", icon: "↻", title: `보강 · ${classMk[0].reason ?? "8회 채우기"}${classMk[0].at_time ? " " + hhmm(classMk[0].at_time) : ""}`, small: names(classMk), ids: classMk.map((m) => m.id) });
  for (const m of mk.filter((m) => m.of_date)) rows.push({ kind: "mk", icon: "↻", title: `보강${m.at_time ? " " + hhmm(m.at_time) : ""} · ${m.name}`, small: `${md(m.of_date)} 결석의 보강${m.reason ? " · " + m.reason : ""}`, id: m.id });
  for (const e of (b.exams ?? []).filter((e) => examOn(e, date) || e.english_on === date))
    rows.push({ kind: e.english_on === date ? "exam2" : "exam", icon: "📝", title: `${e.english_on === date ? "영어 시험일" : "시험"} · ${examTitle(e)}${e.grade ? " · " + e.grade : ""}`, small: `${e.term_from ? `${md(e.term_from)}~${md(e.term_to)}` : ""}${e.english_on ? ` · 영어 ${md(e.english_on)}` : " · 영어일 없음"}`, tag: e.source === "neis" ? "나이스" : e.source === "site" ? "홈페이지" : "손으로", id: e.id });
  for (const t of (b.todos ?? []).filter((t) => t.due_on === date)) rows.push({ kind: "todo", icon: "📋", title: t.title, small: [t.name, t.due_time ? hhmm(t.due_time) : null].filter(Boolean).join(" · "), id: t.id });
  return rows;
}
export const dayTitle = (date) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${weekdayName(date)}`;
/** 머리 알약 — 「보강 안 잡힘 N」(그 달 결석 예정 중 아직 안 잡은 것) */
export const unscheduled = (b, ym) => (b.makeups ?? []).filter((m) => m.of_date && String(m.of_date).startsWith(ym) && m.state === "todo").length;
/** 반 알약 글 — 「N회」 */
export const sessionsPill = (c, target) => `${sessionsOf(c, target).n}회`;
