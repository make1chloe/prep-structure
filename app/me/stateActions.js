"use server";

import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { STATES, isCalling, stateOf } from "@/lib/activity";
import { pushToStaff } from "@/app/push/actions";

const SQL = "supabase/migrations/0085_activity_student.sql 을 먼저 실행해주세요.";

/**
 * 학생이 **자기 상태**를 바꾼다.
 *
 * 누구 것인지는 **서버가 정한다.** 화면에서 받은 학생 id 를 믿으면, 남의
 * id 를 넣어 남의 상태를 바꿀 수 있다. my_student_id() 로 지금 로그인한
 * 사람의 학생 id 를 직접 물어본다 (DB 정책도 같은 것으로 한 번 더 막는다 —
 * 여기만 믿으면 나중에 다른 길이 생겼을 때 뚫린다).
 */
export async function setMyState(state) {
  const ok = state === "idle" || STATES.some((s) => s.key === state);
  if (!ok) return { error: "알 수 없는 상태예요." };

  const supabase = await createClient();
  const { data: sid, error: whoErr } = await supabase.rpc("my_student_id");
  if (whoErr) return { error: "0047 SQL 을 먼저 실행해주세요." };
  if (!sid) return { error: "학생 계정이 연결되어 있지 않아요." };

  if (state === "idle") {
    const { error } = await supabase.from("student_activity").delete().eq("student_id", sid);
    if (error) return { error: SQL };
    return { error: null };
  }

  const row = {
    student_id: sid,
    date: todaySeoul(),
    state,
    updated_at: new Date().toISOString(),
    by_student: true,
  };
  let { error } = await supabase
    .from("student_activity")
    .upsert(row, { onConflict: "student_id" });
  // 0085 전이면 by_student 칸이 없다 — 그것만 빼고 넣는다
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const { by_student: _b, ...noFlag } = row;
    ({ error } = await supabase
      .from("student_activity")
      .upsert(noFlag, { onConflict: "student_id" }));
  }
  if (error) return { error: SQL };

  // **부르면 알린다.** 이건 지금 가보셔야 하는 일이라, 화면을 보고 계실
  // 때만 알면 늦다. 폰에 뜨면 워치에도 그대로 뜬다.
  // (다른 상태는 안 보낸다 — 「쉬는 중」 까지 울리면 알림을 꺼버리시게 된다)
  if (isCalling(state)) {
    const { data: me } = await supabase
      .from("students").select("name").eq("id", sid).maybeSingle();
    // **무슨 일로 부르는지까지 알림에 적는다** (2026-08-07). 질문인지
    // 채점 오류인지에 따라 들고 갈 것이 다르다
    const s = stateOf(state);
    await pushToStaff({
      title: `🙋 ${s.label}`,
      body: `${me?.name || "학생"} 학생이 부릅니다.`,
      url: "/today",
    });
  }

  // **revalidatePath 를 안 부른다.**
  //   선생님 화면은 실시간으로 받는다 (0084). 여기서 캐시를 털어봐야 학생
  //   화면만 다시 그려지고 선생님 화면과는 상관이 없다.
  return { error: null };
}
