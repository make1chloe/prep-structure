"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 비밀번호를 바꿨다고 표시한다.
 *
 * 비밀번호 자체는 Supabase 가 바꾼다 (브라우저에서 updateUser).
 * 여기서는 "바꿔야 함" 깃발만 내린다 — 그래야 다음부터 안 물어본다.
 */
export async function pwChanged() {
  const supabase = createClient();
  const { error } = await supabase.rpc("clear_must_change_pw");
  if (error && (error.code === "PGRST202" || error.code === "42883")) {
    return { error: "선생님이 0045 SQL 을 먼저 실행해야 해요." };
  }
  revalidatePath("/me");
  return { error: error ? error.message : null };
}
