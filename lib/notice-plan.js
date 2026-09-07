/** 📢 공지 판단(목업 20 「공지에 붙이기」 · 남긴 것 14 · 4단계-6) — 순수 셈: 양식 읽기(제목 · 받는 쪽 셋 · 반·학교 · 울림) · 받는 쪽 글 · 상태 글(안 보냄 · 📎 n / 보냄 M/D · 읽음 a/b) · 보낼 수 있나(안 보낸 것만) · 아이·학부모 카드 줄 · 안 읽은 것 */
import { md, seoulDate } from "./dash-plan.js";
export const TO_ROLE = Object.freeze([["both", "학생·학부모"], ["parent", "학부모"], ["student", "학생"]]);
export const roleText = (r) => TO_ROLE.find(([k]) => k === r)?.[1] ?? String(r ?? "");
export function parseNotice(f = {}) {
  const title = String(f.title ?? "").trim(); if (!title) throw new Error("공지 제목을 적으세요");
  if (title.length > 80) throw new Error("제목은 80자까지 — 긴 말은 본문에");
  const to_role = String(f.to_role ?? "both"); if (!TO_ROLE.some(([k]) => k === to_role)) throw new Error(`받는 쪽이 아닙니다: ${to_role}`);
  return { title, body: String(f.body ?? "").trim() || null, to_role, class_id: f.class_id || null, school_id: f.school_id || null, ring: f.ring == null ? true : Boolean(f.ring) };
}
/** 「학부모 · 반 월수 5시」 · 「학생·학부모 · 전체」 · 「학생 · 학교 신정중」 */
export function targetText(n = {}) { const parts = []; if (n.class) parts.push(`반 ${n.class}`); if (n.school) parts.push(`학교 ${n.school}`); return `${roleText(n.to_role)} · ${parts.length ? parts.join(" · ") : "전체"}`; }
export const sendable = (n) => Boolean(n?.id) && !n?.sent_at;
/** 「안 보냄 · 📎 2」 · 「보냄 9/7 · 읽음 3/12 · 📎 1」 */
export function statusText(n = {}) { const files = Number(n.files?.length ?? 0); const att = files ? ` · 📎 ${files}` : ""; if (!n.sent_at) return `안 보냄${att}`; return `보냄 ${md(seoulDate(n.sent_at))} · 읽음 ${Number(n.reads ?? 0)}/${Number(n.targets ?? 0)}${att}`; }
export function counts(notices = []) { return { total: notices.length, unsent: notices.filter((n) => !n.sent_at).length, sent: notices.filter((n) => n.sent_at).length }; }
/** 07·09 📢 카드 줄 — 제목 · 작은 글(M/D · 반/학교/전체) · 본문 · 📎 · 안 읽음(read_at 없음) */
export function noticeLines(board = []) { return (board ?? []).map((n) => ({ id: n.id, title: n.title, body: n.body ?? "", small: `${n.sent_at ? md(seoulDate(n.sent_at)) : ""} · ${n.class ? `반 ${n.class}` : n.school ? `학교 ${n.school}` : "전체"}`, files: n.files ?? [], unread: !n.read_at })); }
export const unreadIds = (lines = []) => lines.filter((l) => l.unread).map((l) => l.id);
