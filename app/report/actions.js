"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resend } from "@/app/resend/actions";

function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}

// 고친 문구를 저장한다. 이후로는 자동 생성 문구 대신 이 문구를 쓴다.
export async function saveReportText(reportId, text) {
  if (!reportId) return { error: "리포트가 없어요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ report_text: (text || "").trim() || null })
    .eq("id", reportId);
  if (isMissingColumn(error)) {
    return { error: "0012 SQL을 먼저 실행해주세요 (report_text 컬럼)." };
  }
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

// 자동 생성 문구로 되돌린다
export async function resetReportText(reportId) {
  if (!reportId) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ report_text: null })
    .eq("id", reportId);
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

/**
 * 발송 — 설정한 방식대로 실제로 보낸다.
 *   직접 발송(copy) 이면 "보냄"으로 기록만 하고, 문자/웹훅이면 실제로 나간다.
 * items: [{ id, phone, name, body }]
 */
export async function sendReports(items) {
  return resend(items, "report");
}

// 발송 취소 (잘못 눌렀을 때)
export async function unsend(reportIds) {
  const ids = Array.isArray(reportIds) ? reportIds : [reportIds];
  if (ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ sent_at: null })
    .in("id", ids);
  if (isMissingColumn(error)) {
    return { error: "0012 SQL을 먼저 실행해주세요 (sent_at 컬럼)." };
  }
  revalidatePath("/report");
  return { error: error ? error.message : null };
}
