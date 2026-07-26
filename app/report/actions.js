"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

// 발송 처리 — 지금은 발송 API가 붙어 있지 않아 "보냄"으로 기록만 한다.
// 문자는 복사해서 보내고, 나중에 솔라피/바티를 붙이면 이 자리에서 실제 발송한다.
export async function markSent(reportIds, sent = true) {
  const ids = Array.isArray(reportIds) ? reportIds : [reportIds];
  if (ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ sent_at: sent ? new Date().toISOString() : null })
    .in("id", ids);
  if (isMissingColumn(error)) {
    return { error: "0012 SQL을 먼저 실행해주세요 (sent_at 컬럼)." };
  }
  revalidatePath("/report");
  return { error: error ? error.message : null };
}
