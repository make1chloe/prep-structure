// 선생님이 학생 화면을 **직접 눌러보는** 체험 모드
//
// 학생용 앱을 나눠주기 전에, 원장님이 먼저 눌러봐야 한다.
// 타이머가 어떻게 도는지, 학습완료를 누르면 오늘 수업 화면에 어떻게 뜨는지는
// 눌러보지 않으면 알 수 없다. 로그아웃하고 학생 계정으로 다시 들어가는 건
// 수업 중에 할 수 있는 일이 아니다.
//
// 그래서 **선생님 계정 그대로** 특정 학생인 척 누를 수 있게 한다.
//   · 선생님(principal/instructor/assistant)만 된다
//   · 누른 것은 **진짜로 기록된다** — 그래야 시험이 되니까.
//     대신 그 자리에서 지울 수 있게 해두었다 (clearTryout)
//
// 학생·학부모 계정이 남의 id 를 넣어 들어오는 건 막혀 있다.
// (DB 의 RLS 도 따로 막지만, 여기서 한 번 더 막는다)

const STAFF = ["principal", "instructor", "assistant"];

/**
 * 지금 무엇으로 눌러야 하는가.
 *
 * @param asId 선생님이 "이 학생인 척" 하려는 학생 id (없으면 본인)
 * @returns { studentId, acting } — acting 이면 선생님이 대신 누르는 중
 */
export async function resolveStudent(supabase, asId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { studentId: null, acting: false, error: "로그인이 필요해요." };

  if (asId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (STAFF.includes(profile?.role)) {
      const { data: s } = await supabase
        .from("students")
        .select("id")
        .eq("id", asId)
        .maybeSingle();
      if (s?.id) return { studentId: s.id, acting: true, error: null };
      return { studentId: null, acting: false, error: "그 학생을 찾을 수 없어요." };
    }
    // 선생님이 아닌데 남의 id 를 넣었다 — 조용히 본인으로 되돌린다
  }

  const { data: me } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!me?.id) {
    return { studentId: null, acting: false, error: "학생 계정으로 로그인해주세요." };
  }
  return { studentId: me.id, acting: false, error: null };
}

export function isStaffRole(role) {
  return STAFF.includes(role);
}
