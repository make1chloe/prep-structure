import { sessionUser } from "./session.js";

// 학생 화면 쓰기 경로의 **"나는 누구인가"** — 서버 액션 14개가 전부 여기를 지난다.
//
// 체험 모드(asId — 선생님이 학생인 척 누르기)는 원장 확정 2026-08-26
// 「체험 없애」로 화면에서 빠졌고, 서버 통로도 여기서 마저 닫았다 (#23).
// 선생님 계정이 어떤 값을 실어 보내도 이제 남의 이름으로 기록되지 않는다.
//
// 여기서 정하는 것은 "누구 이름으로 쓸 것인가"까지다. 실제로 써지는지는
// **DB RLS 가 최종 방어선**이다 (등원·타이머 표는 own_all(profile_id)).

/** 지금 무엇으로 눌러야 하는가. @returns { studentId, error } */
export async function resolveStudent(supabase) {
  const user = await sessionUser(supabase);
  if (!user) return { studentId: null, error: "로그인이 필요해요." };

  const { data: me } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!me?.id) {
    return { studentId: null, error: "학생 계정으로 로그인해주세요." };
  }
  return { studentId: me.id, error: null };
}
