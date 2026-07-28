import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";
import { canOpen, isStaff } from "../roles";

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
      url.pathname = "/me";
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
