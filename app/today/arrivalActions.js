"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function needSql(error) {
  return error && (error.code === "PGRST204" || error.code === "42703");
}

/** 그 날 리포트 한 줄을 확보한다 (출결보다 폰 제출이 먼저일 수 있다) */
async function ensureReport(supabase, studentId, date) {
  const { data: found } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (found?.id) return found.id;
  const { data } = await supabase
    .from("daily_reports")
    .upsert({ student_id: studentId, date }, { onConflict: "student_id,date" })
    .select("id")
    .single();
  return data?.id || null;
}

/**
 * 등원 절차 — 핸드폰 제출 · 숙제 제출.
 *
 * 출결과 함께 등원 줄에서 찍는다. 출결보다 먼저 낼 수도 있어서
 * 리포트 줄이 없으면 만들어 둔다.
 */
export async function setArrival(studentId, date, patch = {}) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();
  const id = await ensureReport(supabase, studentId, date);
  if (!id) return { error: "기록을 만들지 못했어요." };

  const row = {};
  if ("phone" in patch) row.phone_in = !!patch.phone;
  if ("homework" in patch) row.homework_in = !!patch.homework;
  if ("wordWhen" in patch) row.word_when = patch.wordWhen || null;

  const { error } = await supabase.from("daily_reports").update(row).eq("id", id);
  if (needSql(error)) return { error: "0037 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

/** 이 학생의 평소 단어시험 시점을 바꾼다 */
export async function setWordWhenDefault(studentId, when) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("students")
    .update({ word_when: when === "end" ? "end" : "start" })
    .eq("id", studentId);
  if (needSql(error)) return { error: "0037 SQL 을 먼저 실행해주세요." };
  revalidatePath("/today");
  revalidatePath("/students");
  return { error: error ? error.message : null };
}
