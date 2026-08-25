"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { openForSubmission } from "@/lib/answers";

/**
 * 낸 것을 봤다고 표시한다.
 *
 * 표시해야 학생 화면에서도 '선생님 확인' 으로 바뀌고, 아이가 그걸 지울 수
 * 없게 된다. 그리고 안 본 것만 골라 보여줄 수 있다.
 */
export async function markSubmissionChecked(id, on = true) {
  if (!id) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("homework_submissions")
    .update({ checked_at: on ? new Date().toISOString() : null })
    .eq("id", id);
  if (error && (error.code === "42P01" || error.code === "PGRST205")) {
    return { error: "0044 SQL 을 먼저 실행해주세요." };
  }
  // **확인이 곧 열쇠다** (0148) — 이 제출물이 딸린 배정일의 답지를 연다.
  // 원장님: 「수업 없는 날 제출을 원격으로 확인하면, 답지가 열려 미리
  // 채점해 온다」. 답지 없는 숙제면 아무 일도 안 일어난다.
  if (!error && on) await openForSubmission(supabase, id);
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: error ? error.message : null };
}
