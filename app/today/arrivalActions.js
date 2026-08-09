"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { noColumn } from "@/lib/sqlError";

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

/** 그날만 단어시험 시점을 바꾼다 */
export async function setArrival(studentId, date, patch = {}) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();
  const id = await ensureReport(supabase, studentId, date);
  if (!id) return { error: "기록을 만들지 못했어요." };

  const row = {};
  if ("wordWhen" in patch) row.word_when = patch.wordWhen || null;
  if (Object.keys(row).length === 0) return { error: null };

  const { error } = await supabase.from("daily_reports").update(row).eq("id", id);
  if (noColumn(error)) return { error: "0037 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

/**
 * 등원 체크를 **선생님이 대신** 찍는다.
 *
 * 원래는 아이가 자기 화면에서 누르는 것이다. 그런데 학생 앱을 아직 안 줬거나,
 * 폰을 안 가져왔거나, 계정이 없는 아이도 있다. 그럴 때 여기서 찍는다.
 *
 * 출석을 찍으면 등원으로도 잡는다 — 학생이 눌렀을 때와 같게 동작해야
 * 나중에 앱을 나눠줘도 화면이 달라지지 않는다.
 */
export async function setArrivalFor(studentId, date, kind, on) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const COLS = { phone: "phone_at", attend: "attend_at", homework: "homework_at" };
  const col = COLS[kind];
  if (!col) return { error: "알 수 없는 항목이에요." };

  const supabase = createClient();
  const { error } = await supabase.from("arrival_checks").upsert(
    { student_id: studentId, date, [col]: on ? new Date().toISOString() : null },
    { onConflict: "student_id,date" }
  );
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { error: "0038 SQL 을 먼저 실행해주세요." };
    }
    return { error: error.message };
  }

  if (kind === "attend" && on) {
    const { data: already } = await supabase
      .from("attendance")
      .select("student_id")
      .eq("student_id", studentId)
      .eq("date", date)
      .maybeSingle();
    if (!already) {
      await supabase
        .from("attendance")
        .upsert({ student_id: studentId, date, status: "present" }, { onConflict: "student_id,date" });
    }
  }

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
  if (noColumn(error)) return { error: "0037 SQL 을 먼저 실행해주세요." };
  revalidatePath("/today");
  revalidatePath("/students");
  return { error: error ? error.message : null };
}
