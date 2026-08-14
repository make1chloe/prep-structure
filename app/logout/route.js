import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * **로그아웃.**
 *
 * 세 가지를 다 해둔다 — 하나만 어긋나도 「눌러도 안 나가진다」 가 된다.
 *
 * 1. **쿠키를 손으로 지운다.** `signOut()` 이 지워주는 것에만 기대면,
 *    지우는 쪽(Supabase)과 내보내는 쪽(우리가 만든 redirect 응답)이 어긋날 때
 *    아무 소리 없이 그대로 로그인된 채로 남는다. `sb-…-auth-token` 은 길면
 *    `.0` `.1` 로 쪼개져 여러 칸에 담기므로 **이름이 sb- 로 시작하는 것을 다**
 *    지운다.
 * 2. **주소를 새로 짓지 않는다.** `new URL("/login", request.url)` 은 프록시
 *    뒤에서 **다른 host** 를 물고 온다 (여기 검사에서도 127.0.0.1 로 들어가
 *    localhost 로 나갔다). 그러면 담아 쓰는 앱이 딴 집으로 튕겨 나간다.
 *    `Location: /login` 처럼 **길만** 적으면 브라우저가 지금 집에 붙인다.
 * 3. **GET 으로도 받는다.** 홈 화면에 담은 앱에서 form 이 막히거나, 링크로
 *    걸어두고 싶을 때가 있다. 나가는 일은 되돌릴 것이 없으니 열어둔다.
 */
async function bye() {
  const supabase = createClient();
  try {
    await supabase.auth.signOut();
  } catch {
    // 이미 끊긴 판일 수도 있다 — 그래도 쿠키는 지우고 나간다
  }

  const res = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  cookies()
    .getAll()
    .filter((c) => c.name.startsWith("sb-"))
    .forEach((c) => res.cookies.set(c.name, "", { path: "/", maxAge: 0 }));
  // 역할 캐시도 지운다 — 다음 사람이 이 브라우저로 로그인할 수 있다
  res.cookies.set("app-role", "", { path: "/", maxAge: 0 });
  return res;
}

export async function POST() {
  return bye();
}

export async function GET() {
  return bye();
}
