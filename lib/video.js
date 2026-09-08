/** 영상 19 의 손 — 판 읽기(한 벌 video_board) · + 영상 · 고치기·내리기 · 배정(영상 × 아이 + 마감) · 마감 미루기 · 📨 안 본 아이 재촉(알림 길 하나 lib/notify) · 아이의 구간 찍기(video_mark — 겹침은 Postgres 가 합친다) · 길이 채우기.
 *  판단은 lib/video-plan.js(순수). 지우지 않는다 — 영상은 hidden, 배정은 retired */
import { db } from "./supabase.js";
import { parseVideo, parseAssign, counts, statusOf } from "./video-plan.js";
import { notify } from "./notify.js";
import { changed } from "./sqlError.js";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
export async function videoBoard(sb, date) {
  const { data, error } = await db(sb).rpc("video_board", { p_on: date });
  if (error) throw new Error(`영상을 못 읽음: ${error.message}`);
  if (!data) throw new Error("영상 배정은 학원 사람의 화면입니다");
  return data;
}
export async function addVideo(sb, f) { const p = parseVideo(f); const ins = row(await db(sb).from("video").insert(p).select("id").single(), "영상을 못 넣음"); return ins.id; }
export async function setVideo(sb, id, patch = {}) {
  const p = {};
  if ("title" in patch) { p.title = String(patch.title ?? "").trim(); if (!p.title) throw new Error("제목이 없습니다"); }
  if ("folder" in patch) p.folder = String(patch.folder ?? "").trim() || null;
  if ("state" in patch) { if (!["active", "hidden"].includes(patch.state)) throw new Error("상태가 아닙니다"); p.state = patch.state; }
  if ("seconds" in patch) p.seconds = patch.seconds == null ? null : Number(patch.seconds);
  if (!Object.keys(p).length) return;
  changed(await db(sb).from("video").update(p, { count: "exact" }).eq("id", id), "영상을 못 고침");
}
/** 배정 — 아이마다 한 줄(영상 × 아이 유니크). 이미 있으면 마감을 새로 적고 다시 켠다 */
export async function assignVideo(sb, videoId, f) {
  const p = parseAssign(f);
  changed(await db(sb).from("video_assign").upsert(p.studentIds.map((student_id) => ({ video_id: videoId, student_id, due_on: p.dueOn, state: "active" })), { onConflict: "video_id,student_id" , count: "exact" }), "배정을 못 넣음");
  return { n: p.studentIds.length };
}
export async function postponeVideo(sb, videoId, dueOn) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dueOn ?? ""))) throw new Error("미룰 날짜를 고르세요");
  const { error, count } = await db(sb).from("video_assign").update({ due_on: dueOn }, { count: "exact" }).eq("video_id", videoId).eq("state", "active");
  if (error) throw new Error(`마감을 못 미룸: ${error.message}`);
  return { n: count ?? 0 };
}
export async function retireAssign(sb, assignId) { changed(await db(sb).from("video_assign").update({ state: "retired" }, { count: "exact" }).eq("id", assignId), "배정을 못 내림"); }
/** 📨 안 본 아이 재촉 — 아직·보다 만 아이에게 앱 알림(아이 기기 + 학부모 기기, who=all). 길은 lib/notify 하나. 스위치가 off 면 자취만 남는다(대전제-0 — 그렇게 말한다) */
export async function remindVideo(svc, sb, videoId, date) {
  const b = await videoBoard(sb, date); const v = (b.videos ?? []).find((x) => x.id === videoId); if (!v) throw new Error("영상이 없습니다");
  const cut = Number(b.rules?.["video.done_pct"] ?? 95);
  const targets = (v.assigns ?? []).filter((a) => a.state !== "retired" && statusOf(a, cut).key !== "done");
  let sent = 0, failed = 0, sink = null;
  for (const a of targets) { const r = await notify(svc, { kind: "video", studentId: a.student_id, url: "/me/videos", tag: `video-${videoId}-${a.student_id}`, why: { table: "video_assign", id: a.id }, who: "all" }); sink = r.sink; sent += r.sent; failed += r.failed; }
  return { n: targets.length, sent, failed, sink, ...counts(v.assigns, cut) };
}
/** 아이가 구간을 찍는다 — 지나간 자리만. 겹침·「다 봄」은 SQL(0128) */
export async function markSpan(sb, videoId, from, to, pos) { return row(await db(sb).rpc("video_mark", { p_video: videoId, p_from: Math.floor(from), p_to: Math.floor(to), p_pos: Math.floor(pos ?? to) }), "구간을 못 찍음"); }
export async function fillDuration(sb, videoId, seconds) { return Boolean(row(await db(sb).rpc("video_duration", { p_video: videoId, p_seconds: Math.round(Number(seconds) || 0) }), "길이를 못 적음")); }
/** ④ 아이가 재생기를 열었다 — 연 횟수 +1(정의자 · 배정된 영상만). 돌려주는 것: 지금까지 연 횟수 */
export async function openVideo(sb, videoId) { return Number(row(await db(sb).rpc("video_open", { p_video: videoId }), "연 횟수를 못 적음") ?? 0); }
