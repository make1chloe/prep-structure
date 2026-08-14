// 로그인한 사람이 누구인가 — **쿠키에서 읽는다. 인증 서버에 안 물어본다.**
//
// 원장님 (2026-08-14): 「버튼입력속도, 모든 페이지의 로딩 자체가 느려」.
//
// `auth.getUser()` 는 부를 때마다 Supabase 인증 서버에 **네트워크 왕복**을
// 한다. 페이지 서른두 곳과 서버 액션 예순몇 곳이 이걸 부르고 있었다 —
// 화면 하나, 단추 하나마다 왕복 하나씩이 기본요금으로 붙는 셈이다.
//
// `getSession()` 은 쿠키에 든 토큰을 읽을 뿐이라 왕복이 없다.
//
// **위조는 걱정하지 않는다** — 여기서 얻은 uid 로 하는 일은 결국 전부
// DB 조회·수정이고, 그 요청에는 같은 토큰이 실려 간다. 토큰이 위조면
// PostgREST 가 서명 검사에서 거절한다. 즉 **진짜 검증은 DB 왕복에 이미
// 포함되어 있다.** 여기서 한 번 더 인증 서버에 묻는 것은 같은 검사를
// 두 번 내는 것이었다.
export async function sessionUser(supabase) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user || null;
  } catch {
    return null;
  }
}
