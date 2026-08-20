"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/session";
import { resend } from "@/app/resend/actions";
import { sendNotices, assignAnnouncedBooks } from "./noticeActions";
import { pushToFamilies } from "@/app/push/actions";

/**
 * **예약 발송** (0126, 원장님 2026-08-16 — 「체크박스로 선택해서 보내는
 * 기능, 예약기능 만들어줘」).
 *
 * 서버에 시계가 따로 없다. 예약된 것은 **시각이 지난 뒤 직원이 앱을 열
 * 때** 나간다 — 대시보드·발송 화면이 열릴 때마다 runDueSends 가 밀린
 * 예약을 확인해서 보낸다. 몇 분 늦을 수는 있어도 잊히지는 않는다.
 *
 * kind 두 가지:
 *   report — payload { reportIds: [...] }               리포트 발송 표시+알림
 *   book   — payload { items, templateId, ids, bookIds, startOn }  교재 안내
 */

const KINDS = new Set(["report", "book"]);

export async function scheduleSend(kind, dueAt, payload, note) {
  if (!KINDS.has(kind)) return { error: "모르는 종류예요." };
  const due = new Date(dueAt || "");
  if (isNaN(due.getTime())) return { error: "예약 시각을 골라주세요." };
  const supabase = createClient();
  const user = await sessionUser(supabase);
  const { error } = await supabase.from("scheduled_sends").insert({
    kind,
    due_at: due.toISOString(),
    payload: payload || {},
    note: (note || "").slice(0, 200) || null,
    created_by: user?.id || null,
  });
  if (error && (error.code === "42P01" || error.code === "PGRST205")) {
    return { error: "0126 SQL 을 먼저 실행해주세요 (설정 → SQL)." };
  }
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

/** 아직 안 나간 예약 (+ 최근 나간 것 몇 개 — 잘 나갔는지 보게) */
export async function listScheduled() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("scheduled_sends")
    .select("id, kind, due_at, note, sent_at, result, created_at")
    .order("due_at", { ascending: true })
    .limit(50);
  if (error) return { rows: [], error: null };   // 0126 전 — 조용히
  return { rows: data || [], error: null };
}

export async function cancelScheduled(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("scheduled_sends")
    .delete()
    .eq("id", id)
    .is("sent_at", null);   // 이미 나간 것은 기록이다 — 못 지운다
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

/**
 * 때가 된 예약을 보낸다 — 직원 화면(대시보드·발송)이 열릴 때 부른다.
 *
 * 실패해도 sent_at 을 적는다 — 안 적으면 열 때마다 같은 실패를 되풀이하고,
 * 문자라면 요금이 되풀이된다. 실패 사유는 result 에 남아 화면에 보인다.
 */
export async function runDueSends(supa = null) {
  // supa — 외부 크론(/api/cron/send)이 서버 열쇠 클라이언트를 넣어준다.
  // 없으면 로그인 쿠키(직원이 화면을 연 순간)로 돈다.
  const supabase = supa || createClient();
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("scheduled_sends")
    .select("id, kind, payload")
    .is("sent_at", null)
    .lte("due_at", now)
    .order("due_at", { ascending: true })
    .limit(10);
  if (error || !due?.length) return { ran: 0 };

  let ran = 0;
  for (const job of due) {
    // 먼저 잠근다 — 두 화면이 같이 열려도 한 번만 나가게
    const { data: mine } = await supabase
      .from("scheduled_sends")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", job.id)
      .is("sent_at", null)
      .select("id");
    if (!mine?.length) continue;

    let result = null;
    try {
      if (job.kind === "report") {
        const ids = job.payload?.reportIds || [];
        const res = await resend(ids.map((id) => ({ id })), "report", supa);
        result = { count: res?.count ?? 0, failed: res?.failed || [], error: res?.error || null };
      } else if (job.kind === "book") {
        const p = job.payload || {};
        const res = await sendNotices(p.items || [], "book", p.templateId || null, supa);
        if (!res?.error && p.ids?.length && p.bookIds?.length && p.startOn) {
          await assignAnnouncedBooks(p.ids, p.bookIds, p.startOn, supa);
        }
        result = { count: res?.count ?? 0, failed: res?.failed || [], error: res?.error || null };
      } else if (job.kind === "push") {
        // 배치 알림 (2026-08-21 규칙) — 같은 정각에 뜬 같은 집 알림은
        // 아래 묶음 단계에서 이미 하나로 합쳐 들어온다
        const p = job.payload || {};
        const res = await pushToFamilies(
          p.studentIds || [],
          { title: p.title, body: p.body || "", url: p.url || "/parent" },
          p.who || "all",
          supa
        );
        result = { sent: res?.sent ?? 0, error: res?.error || null };
      } else {
        result = { error: `모르는 종류: ${job.kind}` };
      }
    } catch (e) {
      result = { error: e?.message || "보내다 멈췄어요." };
    }
    await supabase.from("scheduled_sends").update({ result }).eq("id", job.id);
    ran += 1;
  }
  if (ran > 0) revalidatePath("/report");
  return { ran };
}
