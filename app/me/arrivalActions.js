"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";

/**
 * 등원 체크 — **학생이 누른다.**
 *
 * 들어와서 폰 내고 숙제 내는 건 아이 몫이다.
 * 선생님은 오늘 수업 화면에서 다 냈는지 보기만 하면 된다.
 * (출석 체크는 외부 앱에서 하므로 여기서는 다루지 않는다)
 */
export async function checkArrival(kind, on) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data: me } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!me?.id) return { error: "학생 계정으로 로그인해주세요." };

  const col = kind === "homework" ? "homework_at" : "phone_at";
  const { error } = await supabase.from("arrival_checks").upsert(
    {
      student_id: me.id,
      date: todaySeoul(),
      [col]: on ? new Date().toISOString() : null,
    },
    { onConflict: "student_id,date" }
  );
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { error: "선생님이 SQL 을 먼저 실행해야 해요." };
    }
    return { error: error.message };
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null };
}
