import { sessionUser } from "./session.js";

// 학생 화면 쓰기 경로의 **"나는 누구인가"** — 서버 액션 14개가 전부 여기를 지난다.
//
// 체험 모드(asId — 선생님이 학생인 척 누르기)는 원장 확정 2026-08-26
// 「체험 없애」로 화면에서 빠졌고, 서버 통로도 여기서 마저 닫았다 (#23).
// 선생님 계정이 어떤 값을 실어 보내도 남의 이름으로 기록되지 않는다.
//
// 학부모 계정도 여기로 온다 (0068 — 「학부모도 올린다. 결석을 알리는 건
// 대개 학부모다」). 연결된 **제 아이**(parent_student)로만 해석하고,
// 아이가 여럿이면 호출부가 studentId 로 어느 아이인지 말해준다.
//
// 여기서 정하는 것은 "누구 이름으로 쓸 것인가"까지다. 실제로 써지는지는
// **DB RLS 가 최종 방어선**이다 — 학부모는 my_student_ids 로 열어둔 곳
// (0068 사진 버킷)에만 쓸 수 있고, 등원·타이머처럼 학생 본인만 쓰는 표는
// own_all(profile_id) 이 막는다.

/**
 * 지금 무엇으로 눌러야 하는가.
 *
 * @param studentId 학부모 계정일 때 어느 아이인지 (학생 계정이면 무시 — 항상 본인)
 * @returns { studentId, error }
 */
export async function resolveStudent(supabase, studentId = null) {
  const user = await sessionUser(supabase);
  if (!user) return { studentId: null, error: "로그인이 필요해요." };

  // 학생 계정 — 무조건 본인 (남의 id 를 실어 보내도 본인으로)
  const { data: me } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (me?.id) return { studentId: me.id, error: null };

  // 학부모 계정 — 연결된 아이 (RLS my_student_ids 와 같은 근거: parent_student)
  const { data: links } = await supabase
    .from("parent_student")
    .select("student_id")
    .eq("parent_profile_id", user.id);
  const kids = (links || []).map((l) => l.student_id);
  if (kids.length > 0) {
    if (studentId) {
      return kids.includes(studentId)
        ? { studentId, error: null }
        : { studentId: null, error: "연결된 학생이 아니에요." };
    }
    if (kids.length === 1) return { studentId: kids[0], error: null };
    return { studentId: null, error: "어느 학생인지 골라주세요." };
  }

  return { studentId: null, error: "학생 계정으로 로그인해주세요." };
}
