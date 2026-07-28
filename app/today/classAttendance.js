"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 반별 출결 — 특강처럼 따로 세야 하는 반.
 *
 * 정규는 왔는데 특강만 빠지는 날이 있다. 그날 출결 한 줄로는 그것을
 * 적을 수가 없다 (한 학생 하루에 한 줄이므로). 그런데 결석·보강·수강료가
 * 반마다 따로 계산되니 여기가 틀리면 **돈이 틀린다.**
 *
 * 그래서 특강 출결은 여기에 따로 남긴다.
 *   attendance       = 그 학생이 그날 학원에 왔는가 (정규 기준)
 *   class_attendance = 그날 그 반에 들어왔는가
 */

function needSql(error) {
  return (
    error &&
    (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204")
  );
}

export async function setClassAttendance(classId, studentId, date, status) {
  if (!classId || !studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();

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
