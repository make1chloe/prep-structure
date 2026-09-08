/** 📢 공지의 손(4단계-6) — 판 읽기(notice_board) · 만들기·고치기(보내기 전만) · 📎 붙이기(보내기 전만 — 보낸 뒤에 붙이면 먼저 본 집은 못 본다, 목업 20) · 보내기(받는 쪽·반·학교로 대상 아이를 고르고 아이마다 notify 갈래 notice — 자취는 notify_log · 끝에 sent_at) · 읽음 찍기(정의자 함수)
 *  판단은 lib/notice-plan.js(순수). 지우는 손이 없다(대전제-6) */
import { db } from "./supabase.js";
import { parseNotice } from "./notice-plan.js";
import { notify } from "./notify.js";
import { changed } from "./sqlError.js";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
async function rpc(sb, fn, args, what) { const { data, error } = await db(sb).rpc(fn, args); if (error) throw new Error(`${what}: ${error.message}`); return data; }
export async function noticeBoard(sb, date) { const data = await rpc(sb, "notice_board", { p_on: date }, "공지 판을 못 읽음"); if (!data) throw new Error("공지는 학원 사람의 화면입니다"); return data; }
export async function addNotice(sb, f, by = null) { const p = parseNotice(f); const ins = row(await db(sb).from("notice").insert({ ...p, created_by: by }).select("id").single(), "공지를 못 만듦"); return ins.id; }
export async function setNotice(sb, id, f) { const p = parseNotice(f); const r = changed(await db(sb).from("notice").update(p).eq("id", id).is("sent_at", null).select("id"), "공지를 못 고침", { zero: "ok" }); if (!r?.length) throw new Error("보낸 공지는 못 고칩니다 — 먼저 본 집과 달라집니다(새 공지로)"); }
/** 📎 — 보내기 전에만. 같은 파일을 두 번 붙여도 한 줄(짝 표 열쇠) */
export async function attachNotice(sb, fileId, noticeId) {
  const n = row(await db(sb).from("notice").select("id,sent_at").eq("id", noticeId).maybeSingle(), "공지를 못 읽음"); if (!n) throw new Error("공지가 없습니다");
  if (n.sent_at) throw new Error("보낸 공지엔 못 붙입니다 — 먼저 본 집은 못 봅니다(새 공지로 보내세요)");
  changed(await db(sb).from("file_link").upsert({ file_id: fileId, notice_id: noticeId }, { onConflict: "file_id,bin_id,day_item_id,notice_id,consult_id", ignoreDuplicates: true , count: "exact" }), "공지에 못 붙임", { zero: "ok" });
}
/** 보내기 — 대상 = 재원생 중 학교·반이 맞는 아이 · 받는 쪽대로 기기(학생 → 아이 기기만 · 학부모 → 학부모 기기 · 둘 다) · 자취는 notify 가 남긴다.
 *  (0-4 경계: sent_at 은 맨 끝에 — 중간에 끊기면 「안 보냄」으로 남아 다시 보낼 수 있고, notify 의 tag(공지·아이)가 같은 아이에게 두 번 안 가게 한다) */
export async function sendNotice(svc, sb, noticeId, date) {
  const n = row(await db(sb).from("notice").select("id,title,to_role,class_id,school_id,sent_at").eq("id", noticeId).maybeSingle(), "공지를 못 읽음"); if (!n) throw new Error("공지가 없습니다");
  if (n.sent_at) throw new Error("이미 보낸 공지입니다");
  let q = db(sb).from("students").select("id,school_id,class_member(class_id,from_date,to_date)").eq("state", "active"); if (n.school_id) q = q.eq("school_id", n.school_id);
  const all = row(await q, "아이를 못 읽음") ?? [];
  const targets = all.filter((s) => !n.class_id || (s.class_member ?? []).some((m) => m.class_id === n.class_id && m.from_date <= date && (!m.to_date || m.to_date >= date)));
  const who = n.to_role === "both" ? "all" : n.to_role, url = n.to_role === "student" ? "/me#notice" : "/parent#notice";
  let sent = 0, failed = 0, sink = null;
  for (const s of targets) { const x = await notify(svc, { kind: "notice", studentId: s.id, url, tag: `notice-${noticeId}-${s.id}`, why: { table: "notice", id: noticeId }, who }); sink = x.sink; sent += x.sent ?? 0; failed += x.failed ?? 0; }
  changed(await db(sb).from("notice").update({ sent_at: new Date().toISOString() }).eq("id", noticeId).select("id"), "보낸 때를 못 적음");
  return { n: targets.length, sent, failed, sink };
}
/** 읽음 — 카드에 보인 공지를 찍는다(정의자 함수 mark_notice_read · 보낸 공지만 · 두 번째부터는 열어본 횟수) */
export async function markNoticesRead(sb, ids = []) { if (!ids.length) return 0; return (await rpc(sb, "mark_notice_read", { p_ids: ids }, "읽음을 못 찍음")) ?? 0; }
