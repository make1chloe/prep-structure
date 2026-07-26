"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { deliver } from "@/lib/send";

function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}
const NEED_SQL = "0013 SQL을 먼저 실행해주세요.";

// 고친 문구 저장 — kind 에 따라 리포트/숙제 문자를 나눠 담는다
export async function saveText(reportId, kind, text) {
  if (!reportId) return { error: "리포트가 없어요." };
  const col = kind === "homework" ? "homework_text" : "report_text";
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ [col]: (text || "").trim() || null })
    .eq("id", reportId);
  if (isMissingColumn(error)) return { error: NEED_SQL };
  revalidatePath("/resend");
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

export async function resetText(reportId, kind) {
  if (!reportId) return { error: null };
  const col = kind === "homework" ? "homework_text" : "report_text";
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ [col]: null })
    .eq("id", reportId);
  if (isMissingColumn(error)) return { error: NEED_SQL };
  revalidatePath("/resend");
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

/**
 * 다시 보냄 — 보낸 시각을 갱신하고 이력을 한 줄 남긴다.
 * items: [{ id, body }]
 */
export async function resend(items, kind) {
  const list = Array.isArray(items) ? items.filter((x) => x?.id) : [];
  if (list.length === 0) return { error: null, count: 0 };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 설정한 방식대로 실제 발송 (직접 발송이면 기록만)
  const settings = await loadSettings(supabase);
  const sendable = list.filter((x) => x.phone);
  const { channel, results } = await deliver(
    settings,
    sendable.map((x) => ({ to: x.phone, text: x.body || "", ref: x.id })),
    { kind: kind === "homework" ? "homework" : "report" }
  );
  const byRef = new Map(results.map((r) => [r.ref, r]));

  // 번호가 없어 못 보낸 건은 실패로 남긴다
  list.forEach((x) => {
    if (!x.phone) byRef.set(x.id, { ref: x.id, ok: false, detail: "학부모 번호 없음" });
  });

  const sentIds = list.filter((x) => byRef.get(x.id)?.ok).map((x) => x.id);
  const now = new Date().toISOString();
  const col = kind === "homework" ? "homework_sent_at" : "sent_at";

  if (sentIds.length > 0) {
    const { error } = await supabase
      .from("daily_reports")
      .update({ [col]: now })
      .in("id", sentIds);
    if (isMissingColumn(error)) return { error: NEED_SQL, count: 0 };
    if (error) return { error: error.message, count: 0 };
  }

  // 이력은 없으면 없는 대로 넘어간다 (기능이 막히지 않도록)
  const rows = list.map((x) => {
    const r = byRef.get(x.id) || {};
    return {
      daily_report_id: x.id,
      kind: kind === "homework" ? "homework" : "report",
      body: x.body || "",
      sent_by: user?.id || null,
      channel,
      ok: !!r.ok,
      detail: r.detail || null,
      to_phone: x.phone || null,
    };
  });
  let { error: logErr } = await supabase.from("report_sends").insert(rows);
  if (isMissingColumn(logErr)) {
    await supabase.from("report_sends").insert(
      rows.map(({ channel, ok, detail, to_phone, ...rest }) => rest)
    );
  }

  const failed = list.filter((x) => !byRef.get(x.id)?.ok);
  revalidatePath("/resend");
  revalidatePath("/report");
  return {
    error: null,
    channel,
    count: sentIds.length,
    failed: failed.map((x) => ({
      name: x.name || "",
      detail: byRef.get(x.id)?.detail || "발송 실패",
    })),
  };
}

// 한 학생의 발송 이력 보기
export async function listSends(reportId) {
  if (!reportId) return { sends: [], error: null };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("report_sends")
    .select("id, kind, body, sent_at")
    .eq("daily_report_id", reportId)
    .order("sent_at", { ascending: false });
  if (error) return { sends: [], error: NEED_SQL };
  return { sends: data || [], error: null };
}
