"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 검사 결과 한 건만 찍는다.
 *
 * 대기줄에서 바로 누르기 위한 것이다. 학생 칸을 열었다 닫았다 하면
 * 열 명이 한꺼번에 끝냈을 때 스무 번을 열어야 한다.
 */
export async function markCheck(studentId, date, itemId, status) {
  if (!studentId || !date || !itemId) return { error: "값이 부족해요." };
  const supabase = createClient();

  const { data: rep } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (!rep?.id) return { error: "먼저 출결을 찍어주세요." };

  // 같은 항목의 예전 결과는 지우고 새로 넣는다 (○ → △ 로 고칠 수 있게)
  await supabase
    .from("daily_report_items")
    .delete()
    .eq("daily_report_id", rep.id)
    .eq("homework_item_id", itemId)
    .in("status", ["done", "weak", "missing"]);

  if (status) {
    const { error } = await supabase
      .from("daily_report_items")
      .insert({ daily_report_id: rep.id, homework_item_id: itemId, status });
    if (error) return { error: error.message };
  }

  revalidatePath("/today");
  return { error: null };
}
