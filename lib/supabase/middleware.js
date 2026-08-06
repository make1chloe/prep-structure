import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";
import { canOpen, isStaff, homeFor } from "../roles";

export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const path = request.nextUrl.pathname;
  // /apply 는 학부모가 로그인 없이 여는 신청 양식이라 열어둔다
  const isAuthRoute =
    path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/apply");

  /**
   * **사람이 아니라 기계가 부르는 주소.**
   *
   * 아이폰이 홈 화면 아이콘을 받아갈 때, 구글 캘린더가 일정을 받아갈 때 —
   * 부르는 쪽에 로그인 정보가 **없다.** 그런데 여기서 로그인으로 돌려보내면
   * 그림 대신 로그인 화면(HTML)이 돌아간다. 아이폰은 그걸 그림으로 못 읽어서
   * 「클」 이라는 글자 타일을 대신 만들어 놓는다. 구글은 그냥 조용히 실패한다.
   *
   * 둘 다 **막힌 줄도 모른 채** 몇 주를 지나갔다. 그래서 여기 이름을 적어둔다.
   *   /api/icon        학원 로고 — 감출 것이 없다
   *   /api/calendar    주소에 붙은 긴 열쇠로 따로 확인한다 (0078)
   *   /manifest        홈 화면에 담을 때 브라우저가 먼저 읽는다
   */
  const isPublicFeed =
    path.startsWith("/api/icon") ||
    path.startsWith("/api/calendar") ||
    path.startsWith("/manifest");

  if (isPublicFeed) return response;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // ── 여기서 한 번만 막는다 ──────────────────────────────
  //
  // 학생·학부모가 선생님 화면을 열 수 없어야 한다. 페이지마다 따로 적으면
  // 언젠가 하나를 빠뜨리고, 그 하나가 사고가 된다. 그래서 지나는 길목에서
  // 한 번만 본다 — 새 페이지를 만들어도 자동으로 막힌다.
  //
  // 역할을 모르면 **학생으로 본다.** 모를 때 열어주는 쪽이 사고다.
  if (user && !isAuthRoute) {
    let role = null;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      role = data?.role || null;
    } catch {
      role = null;
    }

    if (!canOpen(role, path)) {
      const url = request.nextUrl.clone();
      // **그 사람이 가야 할 첫 화면**으로 보낸다. 여기에 /me 를 박아두면
      // 학부모도 학생 화면으로 간다 (학부모 화면은 보는 것이 다르다)
      url.pathname = homeFor(role);
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
