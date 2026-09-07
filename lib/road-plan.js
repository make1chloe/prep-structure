/** 내 교재 로드맵 판단 한 벌(순수, 목업 08 · 확정-④·⑬·㊶·51). 진도 나무는 표 하나 · 보기 넷 — 여기는 08 의 보기(끝냄 · 하는 중 · 아직)를 진도(progress-plan chapterSummary)에서 세어 낸다.
 *  아이가 찍은 줄은 「내가 · 확인 기다리는 중」, 원장·검사가 찍은 줄은 아이가 못 덮는다(RLS 0052 와 같은 판단을 화면도 한다) · ❗ 이의는 진도를 안 바꾼다 */
import { chapterSummary, TRI } from "./progress-plan.js";
import { projectEnd, stopOn, STOP } from "./routine-plan.js";
import { md, seoulDate } from "./dash-plan.js";
export { TRI };
export const FLAG_KIND = Object.freeze([["not_done", "이거 아직 안 했어요"], ["already_done", "이미 했어요"], ["other", "그 밖에"]]);
export const flagKindName = (k) => FLAG_KIND.find(([x]) => x === k)?.[1] ?? k;
export const EDIT_MODE = Object.freeze([["off", "끔"], ["on", "켬"], ["follow", "학원 따라감"]]);
export const editModeName = (k) => EDIT_MODE.find(([x]) => x === k)?.[1] ?? k;
/** 「이대로면 12월 초」 — 남은 소단원 ÷ 한 수업 덩어리 → 앞으로의 수업일 중 그 날 */
export function endText(endDate) { if (!endDate) return ""; const day = Number(endDate.slice(8, 10)); return `${Number(endDate.slice(5, 7))}월 ${day <= 10 ? "초" : day <= 20 ? "중순" : "말"}`; }
/** 이 아이가 이 줄을 찍을 수 있나 — 열려 있고(can_edit) 원장·검사가 찍은 줄이 아닐 때(없거나 · 내가 찍은 것 · 아직인 것). RLS 0052 ② 와 같은 판단 */
export const canMark = (edit, row) => Boolean(edit?.can_edit) && (!row || row.last_by === "student" || row.status === "none");
/** 로드맵 — 끝냄 · 하는 중(진도가 조금이라도 있는 대단원 · 없으면 커서) · 아직. 소단원 줄엔 누가 찍었나(쌤 · 내가) · 확인 기다리는 중 · 찍을 수 있나 */
export function roadOf(b) {
  const units = b.units ?? [], prog = b.progress ?? [], edit = b.edit ?? {};
  const rows = new Map(prog.map((p) => [p.unit_id, p]));
  const sum = chapterSummary(units, prog.map((p) => ({ unit_id: p.unit_id, status: p.status })));
  const sub = (u) => { const r = rows.get(u.id) ?? null; return { id: u.id, short: u.short, activity: u.activity, is_workbook: u.is_workbook, status: r?.status ?? "none", by: r ? (r.last_by === "student" ? "내가" : r.last_by === "check" ? "검사" : "쌤") : null, own: r?.last_by === "student", pending: Boolean(r && r.confirmed === false), doneOn: r?.done_on ?? null, can: canMark(edit, r) }; };
  const chapters = sum.chapters.map((c) => { const subs = c.units.map(sub); const pending = subs.filter((s) => s.pending).length; const finished = c.total > 0 && c.done + c.skip === c.total; const started = c.done + c.skip + c.doing > 0; return { chapter: c.chapter, total: c.total, done: c.done, skip: c.skip, doing: c.doing, subs, pending, finished, started, now: c.chapter === sum.now }; });
  const done = chapters.filter((c) => c.finished), doing = chapters.filter((c) => !c.finished && (c.started || c.now)), todo = chapters.filter((c) => !c.finished && !c.started && !c.now);
  return { chapters, done, doing, todo, finished: sum.finished, total: chapters.length, now: sum.now, pending: chapters.reduce((n, c) => n + c.pending, 0) };
}
/** 머리 꼬리표 — 「3회독」 · 「소단원씩」 · 「끝낸 대단원 4/18」 · 「이대로면 12월 초」 */
export function headTags(b, road) {
  const sb = b.sb ?? {}, basis = b.book?.order_basis ?? "sub";
  const pj = projectEnd({ remaining: Number(b.remaining ?? 0), perSession: Number(sb.per_session ?? 1), days: b.days ?? [], from: b.today });
  const end = Number(b.remaining ?? 0) === 0 ? "다 끝냈어요" : pj.endDate ? `이대로면 ${endText(pj.endDate)}` : "이대로면 — 앞으로 수업일이 없어요";
  return { round: `${sb.round ?? 1}회독`, basis: basis === "chapter" ? "대단원씩" : "소단원씩", finished: `끝낸 대단원 ${road.finished}/${road.total}`, end, sessions: pj.sessions, endDate: pj.endDate };
}
/** 내 교재들 — 「중등3800제3 · 진행중」 · 「수능딥독1 · 숙제멈춤 (수업만)」 · 「능률보카 · 교재멈춤 — 10.17에 풀림」 */
export function bookTags(books = [], today) {
  return books.map((x) => { const st = stopOn(x, today); const name = STOP.find(([k]) => k === st)?.[1] ?? st; return { book_id: x.book_id, name: x.name, state: st, text: `${x.name} · ${name}${st === "hw_off" ? " (수업만)" : ""}${st === "book_off" && x.stop_until ? ` — ${md(x.stop_until)}에 풀림` : ""}` }; });
}
/** ❗ 한 줄 — 「PSS 4-2 수동태 시제」 · 「이거 아직 안 했어요」 — 9/1에 달았어요 · 기다리는 중 / 바꿨어요 / 그대로 두기로 했어요 */
export function flagLines(flags = []) {
  return flags.map((f) => ({ id: f.id, title: `${f.chapter} › ${f.short}`, said: f.kind === "other" ? (f.said || "그 밖에") : flagKindName(f.kind), when: `${md(seoulDate(f.raised_at))}에 달았어요`, state: f.seen_at ? (f.outcome === "changed" ? "바꿨어요" : "그대로 두기로 했어요") : "기다리는 중", waiting: !f.seen_at }));
}
/** 진도 체크 열림 띠 — 「열려 있어요」 · 「닫혀 있어요」 · 이 아이만 끔 */
export function editBand(edit = {}, student = {}) {
  if (edit.can_edit) return { open: true, title: "진도 체크가 열려 있어요", small: "어디까지 했는지 소단원마다 찍어 주세요 · 원장님이 닫으면 잠깁니다", pill: "열림" };
  if (student.progress_edit === "off") return { open: false, title: "진도 체크가 닫혀 있어요", small: "원장님이 내 것만 닫아 두셨어요 — 잘못된 것은 ❗ 로 알려 주세요", pill: "닫힘" };
  return { open: false, title: "진도 체크가 닫혀 있어요", small: "원장님이 열면 소단원마다 찍을 수 있어요 — 지금은 보기만", pill: "닫힘" };
}
/** 원장 쪽 — 「강민서 6 · 윤도현 4」 · 「12일째」 · ❗ 한 줄 「이거 아직 안 했어요」 · 9/1 달았음 · 지금 끝냄 ✅으로 되어 있음 → 처분 단추 */
export function pendingText(students = []) { return students.filter((s) => s.pending > 0).map((s) => `${s.name} ${s.pending}`).join(" · "); }
export function daysOpenText(openedOn, today) { if (!openedOn || !today) return ""; const n = Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${openedOn}T00:00:00Z`)) / 86400000) + 1; return `${n}일째`; }
const STATUS_TEXT = { done: "끝냄 ✅", doing: "하는 중 ◐", none: "아직 ·", skip: "건너뜀" };
export function staffFlagLine(f) {
  const cur = STATUS_TEXT[f.status ?? "none"] ?? f.status;
  const action = f.kind === "not_done" ? { status: "none", label: "아직 안 함으로" } : f.kind === "already_done" ? { status: "done", label: "끝냄으로" } : null;
  return { id: f.id, title: `${f.student} · ${f.book} › ${f.chapter} › ${f.short}`, small: `「${f.kind === "other" ? (f.said || "그 밖에") : flagKindName(f.kind)}」 · ${md(seoulDate(f.raised_at))} 달았음 · 지금 ${cur}으로 되어 있음`, action, said: f.said ?? "" };
}
