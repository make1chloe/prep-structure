/** 영상 판단 한 벌(순수 — 목업 19 「앱 안에서 봅니다」). 지나간 구간만 센다(끌어다 놓고 「다 봤다」를 누르는 길이 막힌다) · 대략치다 — 아이를 판단할 숫자가 아니다 · 영상은 루틴 밖(못하는 아이에게만 따로 배정).
 *  「다 봄」의 문턱은 규칙 video.done_pct. 겹침 합치기는 Postgres(range_agg · 0076·0128)가 한다 — 여기서 다시 합치지 않는다(원칙-1) */
import { md, daysBetween } from "./dash-plan.js";
export const mmss = (sec) => { const s = Math.max(0, Math.round(Number(sec) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/** 유튜브 주소 → 영상 아이디(watch?v= · youtu.be/ · shorts/ · embed/). 아니면 null — 앱 안 재생기는 유튜브만 튼다 */
export function youtubeId(url) {
  const s = String(url ?? "").trim(); if (!s) return null;
  let u; try { u = new URL(s.startsWith("http") ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return /^[\w-]{6,}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v"); if (v && /^[\w-]{6,}$/.test(v)) return v;
    const m = /^\/(shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname); if (m) return m[2];
  }
  return null;
}
/** 「8:04」 → 484초. 비면 null(재생기가 처음 알려 준다) */
export function parseLength(s) { const t = String(s ?? "").trim(); if (!t) return null; const m = /^(\d{1,3}):([0-5]\d)$/.exec(t); if (m) return Number(m[1]) * 60 + Number(m[2]); if (/^\d+$/.test(t)) return Number(t); throw new Error("길이는 「8:04」처럼 적으세요"); }
/** + 영상 양식 — 제목 · 유튜브 주소 · 폴더 · 길이 */
export function parseVideo(f = {}) {
  const title = String(f.title ?? "").trim(); if (!title) throw new Error("제목이 없습니다");
  const url = String(f.url ?? "").trim(); if (!youtubeId(url)) throw new Error("유튜브 주소가 아닙니다 — 앱 안에서 트는 것은 유튜브뿐입니다");
  return { title, url, folder: String(f.folder ?? "").trim() || null, seconds: parseLength(f.length) };
}
/** 배정 양식 — 아이 하나 이상 · 마감(비면 없음) */
export function parseAssign(f = {}) {
  const ids = [...new Set((f.studentIds ?? []).map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)))]; if (!ids.length) throw new Error("아이를 고르세요");
  const due = String(f.dueOn ?? "").trim(); if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("마감 날짜가 아닙니다");
  return { studentIds: ids, dueOn: due || null };
}
/** 한 아이의 상태 — 다 봄(done_at 또는 문턱 이상) · N% 봄 · 아직. 길이를 모르는 영상은 %가 없다 → 초로 말한다 */
export function statusOf(a = {}, cut = 95) {
  const c = Number(cut) || 95, pct = a.pct == null ? null : Number(a.pct), secs = Number(a.secs) || 0;
  if (a.done_at || (pct != null && pct >= c)) return { key: "done", text: "다 봄", cls: "on" };
  if (secs > 0) return { key: "part", text: pct != null ? `${pct}% 봄` : `${mmss(secs)} 봄`, cls: "warn" };
  return { key: "none", text: "아직", cls: "" };
}
/** 영상 하나의 셈 — 다 봄 · 보다 맒 · 안 봄(내린 배정은 뺀다) */
export function counts(assigns = [], cut = 95) {
  const live = (assigns ?? []).filter((a) => a.state !== "retired"), k = live.map((a) => statusOf(a, cut).key);
  return { done: k.filter((x) => x === "done").length, part: k.filter((x) => x === "part").length, none: k.filter((x) => x === "none").length, unwatched: k.filter((x) => x !== "done").length, total: live.length };
}
/** 마감 글 — 「마감 9/8」 · 「오늘까지」 · 「9/3 — 지났어요」 */
export function dueText(dueOn, today) { if (!dueOn) return ""; const n = daysBetween(today, dueOn); return n === 0 ? "오늘까지" : n < 0 ? `마감 ${md(dueOn)} — 지났어요` : `마감 ${md(dueOn)}`; }
/** 아이 화면 줄 — 배정(마감 순, 없는 것은 뒤) + 지나간 구간 → 상태 · 마감 글 · 이어 볼 자리 */
export function myRows(assigns = [], progress = [], cut = 95, today) {
  const p = new Map((progress ?? []).map((x) => [x.video_id, x]));
  return (assigns ?? []).filter((a) => a.state === "active" && a.video?.state === "active").map((a) => { const x = p.get(a.video_id) ?? {}; return { ...a, status: statusOf(x, cut), pct: x.pct ?? null, secs: x.secs ?? 0, lastPos: x.last_pos ?? 0, spans: x.spans ?? [], bar: segments(x.spans ?? [], a.video?.seconds, x.last_pos ?? 0), due: dueText(a.due_on, today), late: Boolean(a.due_on) && daysBetween(today, a.due_on) < 0 && statusOf(x, cut).key !== "done", yt: youtubeId(a.video?.url) }; })
    .sort((a, b) => (a.status.key === "done") - (b.status.key === "done") || String(a.due_on ?? "9999").localeCompare(String(b.due_on ?? "9999")));
}
/** 재생기의 구간 셈 — 지나간 자리만 잇는다. 이어지면(3초 안) 늘리고, 뛰면(끌어다 놓음) 지금까지를 내보내고 새로 시작 · 20초마다 내보낸다(저장) · 멈추면 닫는다.
 *  돌려주는 것: { state, flush } — flush 가 있으면 서버에 찍는다(1초 미만은 버린다) */
export function stepSpan(state = { from: null, to: null }, t, playing = true) {
  const cur = Math.floor(Number(t) || 0), s = state ?? { from: null, to: null };
  const closed = s.from != null && s.to - s.from >= 1 ? { from: s.from, to: s.to } : null;
  if (!playing) return { state: { from: null, to: null }, flush: closed };
  if (s.from == null) return { state: { from: cur, to: cur }, flush: null };
  if (cur >= s.to && cur - s.to <= 3) { const nx = { from: s.from, to: cur }; return nx.to - nx.from >= 20 ? { state: { from: cur, to: cur }, flush: nx } : { state: nx, flush: null }; }
  return { state: { from: cur, to: cur }, flush: closed };   // 뛰었다(앞으로든 뒤로든) — 지나간 것만 남기고 새 구간
}
/** ③ 본 구간 막대(목업 19 vbar) — 구간 [[lo,hi],…] 을 길이로 나눠 조각(left·width %)으로. 길이를 모르면 빈 막대 · 머리(vhead)는 마지막 자리 */
export function segments(spans = [], seconds = 0, lastPos = 0) {
  const total = Number(seconds) || 0; if (!(total > 0)) return { parts: [], head: null };
  const pct = (x) => Math.max(0, Math.min(100, (Number(x) || 0) * 100 / total));
  const parts = (spans ?? []).map((sp) => Array.isArray(sp) ? sp : [sp?.lo ?? sp?.[0], sp?.hi ?? sp?.[1]]).filter((sp) => Number(sp[1]) > Number(sp[0]))
    .map(([lo, hi]) => ({ left: Math.round(pct(lo) * 10) / 10, width: Math.max(0.5, Math.round((pct(hi) - pct(lo)) * 10) / 10) }));
  return { parts, head: lastPos > 0 ? Math.round(pct(lastPos) * 10) / 10 : null };
}
