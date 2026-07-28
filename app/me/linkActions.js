"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 선생님께 받은 코드로 내 계정을 학생에 붙인다.
 *
 * 코드 표는 학생이 직접 못 읽는다 (남의 코드를 뒤져볼 수 없게).
 * 확인과 연결은 DB 함수 하나가 대신한다 — 0043 의 link_student_by_code.
 */
export async function useLinkCode(code) {
  const clean = (code || "").toString().trim().toUpperCase().replace(/\s/g, "");
  if (clean.length < 4) return { ok: false, message: "코드를 넣어주세요." };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("link_student_by_code", { p_code: clean });

  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      return { ok: false, message: "선생님이 0043 SQL 을 먼저 실행해야 해요." };
    }
    return { ok: false, message: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) return { ok: false, message: row?.message || "코드가 맞지 않아요." };

  revalidatePath("/me");
  revalidatePath("/students");
  return { ok: true, message: row.message };
}
