/** 발송 판단 한 벌(순수, 목업 10) — 묶음(🕘 지금 · 📨 마감하면 · 🔔 저절로 · 📢 예약) + 오늘 나간 것 · 읽음 셈 · 예약 시각(확정-㉕) · 치환 자리(뼈대-11).
 *  세는 것은 세어 나온다(원칙-5). 화면(클라이언트)과 서버가 같은 것을 본다 — 보내는 손은 lib/send.js · 밖으로 나가는 길은 lib/notify.js */
import { seoulTime, plusDays, seoulStamp } from "./day-plan.js";
import { md, seoulDate } from "./dash-plan.js";
import { kindName, capName } from "./comment-plan.js";
import { hhmm } from "./late-plan.js";
/** 큐 일의 갈래 — 넣는 자리(lib/late·arrival·plan·send)와 손(lib/send)이 같은 글자를 쓴다 */
export const KINDS = Object.freeze({ daily: "daily_report", late: "late_notice", arrival: "arrival_notice", leave: "leave_notice", plan: "attend_plan_notice" });
export const JOB_NAME = Object.freeze({ daily_report: "데일리리포트", late_notice: "늦은 귀가 안내", arrival_notice: "등원 안내", leave_notice: "하원 안내", attend_plan_notice: "결석·지각 예정 안내" });
export const jobName = (kind) => JOB_NAME[kind] ?? kind;
/** 자취 갈래 → 이름(lib/notify-plan LABEL 과 같은 말 — 여기는 화면용 짧은 글) */
export const LOG_NAME = Object.freeze({ daily: "데일리리포트", late: "늦은 귀가 안내", arrival: "등원 안내", leave: "하원 안내", plan_absent: "결석 예정 안내", plan_late: "지각 예정 안내", monthly: "월간 리포트", notice: "공지사항", score: "성적 입력 안내", fee: "수강료 안내" });
export const logName = (kind) => LOG_NAME[kind] ?? kind;
/** 안 채운 치환 자리 — {{ 가 남아 있으면 못 나간다(뼈대-11). 이름 목록을 돌려준다 */
export const unfilled = (text) => [...String(text ?? "").matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1] || "빈 자리");
/** 예약 때 — 오늘 저녁 · 내일 아침 · 직접(날짜+시각). 시각은 규칙 줄(send.evening · send.morning) */
export const WHEN = Object.freeze(["evening", "morning", "custom"]);
export const whenChoices = (rules = {}) => [["evening", `오늘 ${rules["send.evening"] ?? "21:00"}`], ["morning", `내일 ${rules["send.morning"] ?? "09:00"}`], ["custom", "직접"]];
export function whenAt(choice, today, rules = {}, custom = null) {
  if (choice === "evening") return seoulStamp(today, rules["send.evening"]);
  if (choice === "morning") return seoulStamp(plusDays(today, 1), rules["send.morning"]);
  if (choice === "custom") { if (!custom?.date || !custom?.time) throw new Error("날짜와 시각을 적으세요"); return seoulStamp(custom.date, custom.time); }
  throw new Error(`때가 아닙니다: ${choice}`);
}
/** 「오늘 21:00」 「내일 09:00」 「9/13 09:00」 */
export function whenLabel(atIso, today) { const d = seoulDate(atIso); return `${d === today ? "오늘" : d === plusDays(today, 1) ? "내일" : md(d)} ${seoulTime(atIso)}`; }
/** 자취 한 줄의 상태 글 — 리허설(스위치 off·self 로 안 나간 것)은 그렇게 말한다(대전제-0) */
export function logStatus(l) {
  if (l.failed_at) return { icon: "⚠️", text: `못 보냄 — ${l.fail_why ?? ""}`, bad: true, read: false, unread: false, rehearsal: false };
  if (!l.sent_at) return { icon: "🧪", text: `리허설(${l.sink}) — 실제로는 안 나감 · ${seoulTime(l.created_at)}`, bad: false, read: false, unread: false, rehearsal: true };
  const parts = [`📨 ${seoulTime(l.sent_at)} 보냄`, l.opened_at ? `👁️ ${seoulTime(l.opened_at)} 읽음` : "👁️ 아직 안 읽음"];
  if ((l.open_count ?? 0) > 1) parts.push(`🔁 ${l.open_count}번 열어봄`);
  return { icon: "✅", text: parts.join(" · "), bad: false, read: Boolean(l.opened_at), unread: !l.opened_at, rehearsal: false };
}
export const readCounts = (logs = []) => logs.reduce((c, l) => { const s = logStatus(l); if (s.read) c.read++; else if (s.unread) c.unread++; else if (s.bad) c.failed++; else c.rehearsal++; return c; }, { read: 0, unread: 0, failed: 0, rehearsal: 0 });
/** 큐 일의 상태 글 */
export function jobState(j, nowIso) {
  if (j.state === "done") return { text: "보냄", cls: "on" };
  if (j.state === "taking") return { text: "보내는 중", cls: "" };
  if (j.state === "fail") return { text: `실패 ${j.tries}번 — ${j.last_error ?? ""}`, cls: "bad" };
  if (j.next_at && Date.parse(j.next_at) > Date.parse(nowIso)) return { text: `${j.last_error ? j.last_error + " · " : ""}${seoulTime(j.next_at)} 에 나감`, cls: "" };
  return { text: "대기 — 곧 나감", cls: "" };
}
/** 🕘 지금 — 오늘 판의 늦귀가(약속이 있는 것). 보내는 자리는 오늘 카드(01) 하나(확정-㊿) — 여기서는 상태만 */
export function lateRows(sheets = [], logs = []) {
  return sheets.filter((s) => s.late?.until_at).map((s) => {
    const log = logs.find((l) => l.kind === "late" && l.sheet_id === s.id) ?? null;
    return { id: s.id, name: s.student_name, until: hhmm(s.late.until_at), reason: String(s.late.reason ?? "").trim(), noReason: !String(s.late.reason ?? "").trim(),
             sent: s.late.sent_at ? seoulTime(s.late.sent_at) : null, log: log ? logStatus(log) : null };
  });
}
/** 📨 마감하면 나갑니다 — 오늘 판마다 open(마감 전) · ready(보낼 것) · holes(치환 자리 빔) · scheduled · queued · sent */
export function dailyRows(sheets = [], logs = [], scheduled = [], jobs = []) {
  return sheets.map((s) => {
    const log = logs.find((l) => l.kind === "daily" && l.sheet_id === s.id) ?? null;
    const sch = scheduled.find((x) => x.sheet_id === s.id && !x.sent_at && !x.cancelled_at) ?? null;
    const job = jobs.find((j) => j.kind === KINDS.daily && j.payload?.sheet_id === s.id && j.state !== "done") ?? null;
    const closed = Boolean(s.closed_at), holes = unfilled(s.comment);
    const state = !closed ? "open" : holes.length ? "holes" : sch ? "scheduled" : job ? "queued" : log ? "sent" : "ready";   // 살아 있는 예약·큐가 나간 자취보다 앞선다(다시 예약한 판은 ⏰)
    return { id: s.id, name: s.student_name, closed, comment: String(s.comment ?? "").trim(), cap: s.comment_cap ? capName(s.comment_cap) : null, kind: s.comment_kind ? kindName(s.comment_kind) : null,
             holes, state, scheduledId: sch?.id ?? null, scheduledAt: sch?.at ?? null, job, logId: log?.id ?? null, log: log ? logStatus(log) : null, checked: state === "ready" };
  });
}
/** 🔔 저절로 나가는 것 — 등원·하원·결석·지각 예정 알림 중 아직 안 끝난 일(끝난 것은 「오늘 나간 것」에) */
export function autoRows(jobs = [], nowIso) {
  return jobs.filter((j) => j.kind !== KINDS.daily && j.state !== "done").map((j) => {
    const p = j.payload ?? {};
    const what = j.kind === KINDS.plan ? `${p.date ? md(p.date) + " " : ""}${p.kind === "absent" ? "결석" : "지각"} 예정 안내` : jobName(j.kind);
    return { id: j.id, name: j.student_name ?? "?", what, icon: j.kind === KINDS.plan ? (p.kind === "absent" ? "✕" : "⏰") : j.kind === KINDS.arrival ? "🕘" : j.kind === KINDS.leave ? "🏠" : "🌙", state: jobState(j, nowIso) };
  });
}
/** 📢 예약된 것 — 예약 표(scheduled_send) + 방해금지로 미뤄진 큐 일 */
export function scheduledRows(scheduled = [], jobs = [], sheets = [], nowIso, today) {
  const a = scheduled.filter((x) => !x.sent_at && !x.cancelled_at).map((x) => ({ id: x.id, jobId: null, name: sheets.find((s) => s.id === x.sheet_id)?.student_name ?? "?", what: x.kind === "daily" ? "데일리리포트" : x.kind, at: x.at, when: whenLabel(x.at, today), cancellable: true }));
  const b = jobs.filter((j) => j.state === "wait" && Date.parse(j.next_at) > Date.parse(nowIso) && j.last_error).map((j) => ({ id: null, jobId: j.id, name: j.student_name ?? "?", what: jobName(j.kind), at: j.next_at, when: `${whenLabel(j.next_at, today)} · ${j.last_error}`, cancellable: false }));
  return [...a, ...b].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
}
/** 오늘 나간 것 — 자취(최근 것부터) */
export const sentRows = (logs = []) => logs.map((l) => ({ id: l.id, name: l.student_name ?? "?", what: logName(l.kind), status: logStatus(l), resendable: !logStatus(l).read }));
/** 머리 알약 — 🌙 지금 보낼 것(약속은 있는데 아직 안 보낸 늦귀가) · 📨 마감 n / N */
export const nowCount = (late = []) => late.filter((r) => !r.sent).length;
export const closedCount = (daily = []) => ({ closed: daily.filter((d) => d.closed).length, total: daily.length });
/** 뼈대-8 치환 자리 줄 — 표(v2.placeholder)의 설명을 「{{학생명}} — 아이 이름(예: 강민서)」 꼴로. 안 채운 자리는 unfilled 가 잡아 못 나간다(뼈대-11) */
export const placeholderRows = (list = []) => (list ?? []).map((r) => ({ key: r.key, tag: `{{${r.key}}}`, text: `{{${r.key}}} — ${r.note}${r.example ? `(예: ${r.example})` : ""}` }));
