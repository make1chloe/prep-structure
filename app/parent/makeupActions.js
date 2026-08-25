"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { pushToStaff } from "@/app/push/actions";

/**
 * **답을 안 하신 보강** (0107).
 *
 * 원장님 (2026-08-07) — 「보강 일정이 안내되었을 때 학부모가 확정 버튼까지
 * 누르게 만들어… 둘 중 하나라도 누르지 않으면 계속 어플 사용할 때마다
 * 첫 화면에서 경고메세지를 줘」
 *
 * **앞으로의 보강만** 본다. 지나간 보강에 이제 와서 「확정하세요」 를 띄우면
 * 지울 수 없는 경고가 된다 — 그러면 그 경고 자체를 안 보게 된다.
 */
export async function pendingMakeups(studentIds = []) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0) return { ready: true, rows: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("student_id, date, makeup_time, reason, makeup_of, makeup_confirmed_at, makeup_change_req")
    .in("student_id", ids)
    .eq("status", "makeup")
    .gte("date", todaySeoul())
    .order("date", { ascending: true });

  // 0107 전이면 칸이 없다 — 아무것도 안 그린다 (오류를 어머니께 보일 일이 아니다)
  if (error) return { ready: false, rows: [] };

  return {
    ready: true,
    rows: (data || []).filter((r) => !r.makeup_confirmed_at && !r.makeup_change_req),
  };
}

/**
 * 확정하거나, 그날은 어렵다고 알리거나.
 *
 * attendance 는 잠겨 있다 (출결을 학부모가 고치면 회차와 수강료가 흔들린다).
 * 0107 의 `confirm_makeup` 문으로만 적는다 — 그 문은 확정 여부와 요청 글
 * 두 가지만 고칠 수 있다.
 */
export async function answerMakeup(studentId, date, ok, note) {
  if (!studentId || !date) return { error: "어느 보강인지 모르겠어요." };
  const supabase = await createClient();

  const { error } = await supabase.rpc("confirm_makeup", {
    p_student: studentId,
    p_date: date,
    p_ok: !!ok,
    p_note: (note || "").trim() || null,
  });
  if (error) return { error: "설정 → Supabase 에서 0107 을 먼저 실행해주세요." };

  /**
   * **변경 요청은 반드시 알린다.** 확정은 굳이 안 알려도 된다 —
   * 그날 오시면 되는 것이고, 그것까지 울리면 하루에 열 번이 된다.
   * 변경은 **우리가 무언가를 해야 하는 일**이라 성격이 다르다.
   */
  if (!ok) {
    try {
      const { data: me } = await supabase
        .from("students").select("name").eq("id", studentId).maybeSingle();
      await pushToStaff({
        title: `🔄 보강 일정 변경 요청 — ${me?.name || "학생"}`,
        body: `${date} 보강이 어렵다고 하십니다. ${(note || "").slice(0, 60)}`,
        url: "/",
        tag: "makeup-change",
      });
    } catch { /* 알림이 안 가도 요청은 남았다 */ }
  }

  revalidatePath("/parent");
  revalidatePath("/me");
  revalidatePath("/");
  return { error: null };
}
