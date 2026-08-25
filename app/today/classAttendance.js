"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { needSql } from "@/lib/sqlError";

export async function setClassAttendance(classId, studentId, date, status) {
  if (!classId || !studentId || !date) return { error: "값이 부족해요." };
  const supabase = await createClient();

  // 같은 것을 다시 누르면 지운다 (잘못 찍었을 때 되돌릴 길)
  if (!status) {
    const { error } = await supabase
      .from("class_attendance")
      .delete()
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .eq("date", date);
    if (needSql(error)) return { error: "0042 SQL 을 먼저 실행해주세요." };
    revalidatePath("/today");
    revalidatePath("/tuition");
    return { error: error ? error.message : null };
  }

  const { error } = await supabase.from("class_attendance").upsert(
    { class_id: classId, student_id: studentId, date, status },
    { onConflict: "class_id,student_id,date" }
  );
  if (needSql(error)) return { error: "0042 SQL 을 먼저 실행해주세요." };

  revalidatePath("/today");
  revalidatePath("/tuition");
  return { error: error ? error.message : null };
}
