"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";

/**
 * 등원 체크 — **학생이 누른다.**
 *
 * 들어와서 폰 내고, 출석 체크하고, 숙제 내는 건 아이 몫이다.
 * 선생님은 오늘 수업 화면에서 다 했는지 보기만 하면 된다.
 *
 * 출석 자체는 외부 앱에서 한다. 여기서는 **했는지 짚어줄 뿐**이다 —
 * 아이들이 자꾸 잊어버리기 때문이다.
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

  const COLS = { phone: "phone_at", attend: "attend_at", homework: "homework_at" };
  const col = COLS[kind] || "phone_at";
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

  // 출석 체크를 눌렀으면 **등원으로 잡는다.**
  // 선생님이 또 찍을 이유가 없다. 늦게 온 아이는 누른 시각이 남으니
  // 선생님 화면에서 보고 지각으로 고치면 된다.
  //
  // 여기서 실패해도 체크 자체는 이미 저장됐다. 조용히 넘어간다 —
  // 등원 표시가 안 됐다고 아이에게 빨간 경고를 띄울 일은 아니다.
  if (kind === "attend" && on) {
    const today = todaySeoul();
    const { data: already } = await supabase
      .from("attendance")
      .select("student_id")
      .eq("student_id", me.id)
      .eq("date", today)
      .maybeSingle();
    if (!already) {
      await supabase
        .from("attendance")
        .insert({ student_id: me.id, date: today, status: "present" });
    }
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null };
}
