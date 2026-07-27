"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { loadReportRows } from "@/lib/reportData";
import { normalizeTime } from "@/lib/lateNotice";
import { resend } from "@/app/resend/actions";

function needSql(error) {
  return error && (error.code === "PGRST204" || error.code === "42703");
}

/** 그 날 리포트 한 줄을 확보한다 (출결을 아직 안 찍었어도 보낼 수 있게) */
async function ensureReport(supabase, studentId, date) {
  const { data: found } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (found?.id) return { id: found.id, error: null };

  const { data, error } = await supabase
    .from("daily_reports")
    .upsert({ student_id: studentId, date }, { onConflict: "student_id,date" })
    .select("id")
    .single();
  return { id: data?.id || null, error: error ? error.message : null };
}

/**
 * 하원 예상 시간 · 직접 적은 사유를 저장한다.
 *
 * 자동으로 잡히는 사유(단어 재시험 · 늦귀가 과제)는 저장하지 않는다.
 * 이미 입력한 값에서 매번 계산하기 때문이다 — 리포트를 고치면 문구도 같이 맞는다.
 */
export async function saveLate(studentId, date, { until, reason, text } = {}) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();

  const { id, error: idErr } = await ensureReport(supabase, studentId, date);
  if (idErr || !id) return { error: idErr || "리포트를 만들지 못했어요." };

  const patch = {
    late_until: normalizeTime(until) || null,
    late_reason: (reason || "").trim() || null,
  };
  // 문구를 손으로 고쳤을 때만 담는다 (안 고쳤으면 자동 문구를 계속 쓴다)
  if (text !== undefined) patch.late_text = (text || "").trim() || null;

  const { error } = await supabase.from("daily_reports").update(patch).eq("id", id);
  if (needSql(error)) return { error: "0027 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/report");
  return { error: null, id };
}

/** 지금 나갈 문구를 미리 본다 (자동 사유 + 시간이 반영된 것) */
export async function previewLate(studentId, date) {
  if (!studentId || !date) return { error: "값이 부족해요.", text: "" };
  const supabase = createClient();
  const settings = await loadSettings(supabase);
  const { rows } = await loadReportRows(supabase, date, settings.academy.name, settings.message);
  const row = rows.find((r) => r.studentId === studentId);
  if (!row) return { error: null, text: "", missing: true };
  return { error: null, text: row.lateText, phone: row.phone, sentAt: row.lateSentAt };
}

/**
 * 지금 바로 보낸다.
 *
 * 하원 안내는 **수업 중에** 나가야 의미가 있어서, 발송 화면까지 가지 않고
 * 오늘 수업에서 바로 보낸다. 이력은 다른 문자와 같은 자리에 남는다.
 */
export async function sendLateNow(studentId, date) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();

  const settings = await loadSettings(supabase);
  const { rows } = await loadReportRows(supabase, date, settings.academy.name, settings.message);
  const row = rows.find((r) => r.studentId === studentId);
  if (!row) return { error: "먼저 저장해주세요." };
  if (!row.phone) return { error: "학부모 번호가 없어요. 재원생에서 번호를 넣어주세요." };

  const res = await resend(
    [{ id: row.id, phone: row.phone, name: row.name, body: row.lateText, date }],
    "late"
  );
  revalidatePath("/today");
  return res;
}

/** 잘못 보냈을 때 — 보낸 표시만 지운다 (문자는 이미 나갔다) */
export async function unsendLate(reportId) {
  if (!reportId) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ late_sent_at: null })
    .eq("id", reportId);
  if (needSql(error)) return { error: "0027 SQL 을 먼저 실행해주세요." };
  revalidatePath("/today");
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

/** 하원 안내를 없던 것으로 (시간·사유·문구를 모두 비운다) */
export async function clearLate(studentId, date) {
  if (!studentId || !date) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ late_until: null, late_reason: null, late_text: null })
    .eq("student_id", studentId)
    .eq("date", date);
  if (needSql(error)) return { error: "0027 SQL 을 먼저 실행해주세요." };
  revalidatePath("/today");
  revalidatePath("/report");
  return { error: error ? error.message : null };
}
