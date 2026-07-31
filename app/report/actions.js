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
 * 이 문자는 안 보낸다 — **기록으로 남긴다.**
 *
 * 그냥 넘어가면 목록에 계속 남아서 매일 눈으로 걸러내야 하고, 며칠 지나면
 * 일부러 안 보낸 것인지 깜빡한 것인지 알 수 없다. 보낸 것과 똑같이 남긴다.
 *
 * @param kind report | homework | late
 */
export async function skipSend(reportIds, kind = "report", on = true) {
  const ids = Array.isArray(reportIds) ? reportIds : [reportIds];
  if (ids.length === 0) return { error: null };
  if (!["report", "homework", "late"].includes(kind)) return { error: "알 수 없는 문자예요." };
  const supabase = createClient();

  const { data: rows, error: readErr } = await supabase
    .from("daily_reports")
    .select("id, skip_kinds")
    .in("id", ids);
  if (isMissingColumn(readErr) || readErr?.code === "42703") {
    return { error: "0058 SQL 을 먼저 실행해주세요." };
  }
  if (readErr) return { error: readErr.message };

  for (const r of rows || []) {
    const now = new Set(r.skip_kinds || []);
    on ? now.add(kind) : now.delete(kind);
    const { error } = await supabase
      .from("daily_reports")
      .update({ skip_kinds: [...now] })
      .eq("id", r.id);
    if (isMissingColumn(error)) return { error: "0058 SQL 을 먼저 실행해주세요." };
    if (error) return { error: error.message };
  }

  revalidatePath("/report");
  return { error: null };
}

/**
 * 리포트를 아예 지운다.
 *
 * **그날 수업 기록이 통째로 사라진다** — 숙제 검사 결과와 낸 것까지 함께다.
 * 안 보내기만 하려면 skipSend 를 쓴다. 그래서 부르는 쪽에서 한 번 더 묻는다.
 */
export async function removeReports(reportIds) {
  const ids = Array.isArray(reportIds) ? reportIds : [reportIds];
  if (ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("daily_reports").delete().in("id", ids);
  revalidatePath("/report");
  revalidatePath("/today");
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
