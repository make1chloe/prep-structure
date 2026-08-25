"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { todaySeoul } from "@/lib/day";
import { pickIp, sameNet } from "@/lib/clientIp";
import { resolveStudent } from "@/lib/actAs";
import { pushToFamilies } from "@/app/push/actions";

/**
 * 등원 체크 — **학생이 누른다.**
 *
 * 들어와서 폰 내고, 출석 체크하고, 숙제 내는 건 아이 몫이다.
 * 선생님은 오늘 수업 화면에서 다 했는지 보기만 하면 된다.
 *
 * 출석 자체는 외부 앱에서 한다. 여기서는 **했는지 짚어줄 뿐**이다 —
 * 아이들이 자꾸 잊어버리기 때문이다.
 */
export async function checkArrival(kind, on, asId = null) {
  const supabase = await createClient();
  const { studentId, acting, error: whoErr } = await resolveStudent(supabase, asId);
  if (!studentId) return { error: whoErr || "학생 계정으로 로그인해주세요." };
  const me = { id: studentId };

  // 학원에서 누른 게 맞나 — 오는 길에 미리 누르는 것을 막는다.
  // 등록된 주소가 없으면 안 막는다 (원장님이 안 켰다는 뜻이다).
  //
  // 선생님이 체험 모드로 눌러보는 중이면 막지 않는다.
  // 집에서 미리 눌러봐야 하는데 여기서 막히면 시험 자체를 못 한다.
  if (on && !acting) {
    const nq = await supabase.from("academy_net").select("ip");
    const allowed = (nq.error ? [] : nq.data || []).map((x) => x.ip);
    if (allowed.length > 0 && !sameNet(pickIp(await headers()), allowed)) {
      return { error: "학원에 도착해서 학원 와이파이에 연결한 뒤 눌러주세요." };
    }
  }

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

  /**
   * **핸드폰을 내면 그 자리에서 등원으로 잡는다** (원장님 2026-08-23 —
   * 「학생이 핸드폰 냈어요 누르면 바로 출석 처리하게 해줘」).
   *
   * 전에는 두 번째 단계(출석 체크 했어요)를 눌러야 등원이 됐다. 그런데
   * 폰을 내는 것이 실제로 학원에 **도착한** 순간이고, 아이가 세 단계를
   * 다 누르지 않고 수업에 들어가 버리면 등원이 안 잡혔다.
   * 출석 체크 단계도 그대로 둔다 — 둘 중 **먼저 누른 것**이 등원이 된다.
   *
   * 여기서 실패해도 체크 자체는 이미 저장됐다. 조용히 넘어간다 —
   * 등원 표시가 안 됐다고 아이에게 빨간 경고를 띄울 일은 아니다.
   */
  if ((kind === "phone" || kind === "attend") && on) {
    const today = todaySeoul();
    const { data: already } = await supabase
      .from("attendance")
      .select("student_id")
      .eq("student_id", me.id)
      .eq("date", today)
      .maybeSingle();
    if (!already) {
      const { error: attErr } = await supabase
        .from("attendance")
        .insert({ student_id: me.id, date: today, status: "present" });
      // **어머니께 등원 알림** (원장님 2026-08-23). 방금 등원으로 **새로**
      // 잡혔을 때만 — 이미 잡혀 있으면 두 번 울리지 않는다.
      // 선생님이 체험 모드로 눌러보는 중이면 안 보낸다.
      if (!attErr && !acting) {
        const { data: who } = await supabase
          .from("students").select("name").eq("id", me.id).maybeSingle();
        await pushToFamilies(
          [me.id],
          { title: `${who?.name || "학생"} 등원했어요`, url: "/parent" },
          "parent",
          supabase
        );
      }
    }
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null };
}

/**
 * **하원 — 아이가 누른다** (원장님 2026-08-23 — 「하원 누르면 자동
 * 로그아웃되고, 엄마에게 하원했다고 알림 가게 해줘」).
 *
 * 학생 앱은 등원하면 **학원 공용 기기**로 보고, 집에서는 제 폰으로 본다.
 * 그래서 로그아웃은 화면이 정한다 — 공용 기기로 표시해 둔 기기에서만
 * 로그아웃한다 (제 폰에서 로그아웃하면 집에서 숙제를 못 본다).
 * 여기 서버 쪽은 **누른 시각을 적고 어머니께 알리는 것**까지만 한다.
 */
export async function leaveNow(asId = null) {
  const supabase = await createClient();
  const { studentId, acting, error: whoErr } = await resolveStudent(supabase, asId);
  if (!studentId) return { error: whoErr || "학생 계정으로 로그인해주세요." };

  const today = todaySeoul();
  let { error } = await supabase.from("arrival_checks").upsert(
    { student_id: studentId, date: today, leave_at: new Date().toISOString() },
    { onConflict: "student_id,date" }
  );
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    return { error: "선생님이 SQL(0150) 을 먼저 실행해야 해요." };
  }
  if (error) return { error: error.message };

  // 어머니께 하원 알림 — 체험 모드(선생님이 눌러보는 중)면 안 보낸다
  if (!acting) {
    const { data: who } = await supabase
      .from("students").select("name").eq("id", studentId).maybeSingle();
    await pushToFamilies(
      [studentId],
      { title: `${who?.name || "학생"} 하원했어요`, url: "/parent" },
      "parent",
      supabase
    );
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null };
}
