"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const now = new Date().toISOString();
  const col = kind === "homework" ? "homework_sent_at" : "sent_at";

  const { error } = await supabase
    .from("daily_reports")
    .update({ [col]: now })
    .in("id", list.map((x) => x.id));
  if (isMissingColumn(error)) return { error: NEED_SQL, count: 0 };
  if (error) return { error: error.message, count: 0 };

  // 이력은 없으면 없는 대로 넘어간다 (기능이 막히지 않도록)
  await supabase.from("report_sends").insert(
    list.map((x) => ({
      daily_report_id: x.id,
      kind: kind === "homework" ? "homework" : "report",
      body: x.body || "",
      sent_by: user?.id || null,
    }))
  );

  revalidatePath("/resend");
  revalidatePath("/report");
  return { error: null, count: list.length };
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
