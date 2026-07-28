"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 낸 것을 봤다고 표시한다.
 *
 * 표시해야 학생 화면에서도 '선생님 확인' 으로 바뀌고, 아이가 그걸 지울 수
 * 없게 된다. 그리고 안 본 것만 골라 보여줄 수 있다.
 */
export async function markSubmissionChecked(id, on = true) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("homework_submissions")
    .update({ checked_at: on ? new Date().toISOString() : null })
    .eq("id", id);
  if (error && (error.code === "42P01" || error.code === "PGRST205")) {
    return { error: "0044 SQL 을 먼저 실행해주세요." };
  }
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: error ? error.message : null };
}
