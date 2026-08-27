"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { noTable } from "@/lib/sqlError";
import { sessionUser } from "@/lib/session";

/**
 * 단원평가 결과를 남긴다.
 *
 * '단원평가 대비 복습' 을 내주면 할일이 생기고(0028), 시험을 보면 여기에 남아
 * 월간리포트에 그대로 들어간다.
 *
 * 점수는 **틀린 개수**로 받는다 — 채점할 때 세는 것이 그쪽이다.
 */
export async function addUnitExam(studentId, date, { name, wrong, total, note } = {}) {
  const n = (name || "").trim();
  if (!studentId || !n) return { error: "무슨 단원평가인지 적어주세요." };

  const t = parseInt(total, 10);
  const w = parseInt(wrong, 10);
  const supabase = await createClient();
  const user = await sessionUser(supabase);

  const { error } = await supabase.from("unit_exams").insert({
    student_id: studentId,
    date,
    name: n,
    total: Number.isFinite(t) ? t : null,
    score: Number.isFinite(t) && Number.isFinite(w) ? Math.max(0, t - w) : null,
    note: (note || "").trim() || null,
    created_by: user?.id || null,
  });
  if (noTable(error)) return { error: "0031 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/report");
  return { error: null };
}

export async function deleteUnitExam(id) {
  if (!id) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.from("unit_exams").delete().eq("id", id);
  revalidatePath("/today");
  revalidatePath("/report");
  return { error: error ? error.message : null };
}
