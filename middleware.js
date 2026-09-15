/** 세션 갱신 미들웨어((어29) · 원장님 2026-09-15 「페이지 이동시 맨위 메뉴가 사라짐」).
 *  화면(서버 컴포넌트)은 쿠키를 못 쓴다 · 그래서 로그인 뒤 1시간이 지나 접근 토큰이 끝나면 서버가 갱신은 해도 새 쿠키를 못 남겨,
 *  다음 요청부터 세션을 못 읽는다 → 껍질(app/layout.js 누구())이 메뉴 없이 그려지고, 결국 로그인 화면으로 밀린다.
 *  여기서 요청마다 세션을 읽되 **끝난 때만** 갱신하고(getSession · 인증 서버 왕복은 그때뿐 · 속도 대원칙 2 「auth.getUser() 금지」 그대로) 새 쿠키를 응답에 되쓴다.
 *  검증은 DB(RLS)가 한다 · 여기서 사람을 가리지 않는다(로그인 없으면 화면의 guard 가 /login 으로) */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { keys } from "./lib/supabase-keys.js";
export async function middleware(request) {
  const { url, key, ok } = keys();
  let response = NextResponse.next({ request });
  if (!ok) return response;
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {   // 갱신된 쿠키를 요청(뒤 화면이 읽게)과 응답(브라우저가 남기게) 둘 다에
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  try { await sb.auth.getSession(); } catch {}   // 끝난 토큰만 갱신한다 · 실패해도 화면은 제 길(guard)로 간다
  return response;
}
/** 정적 파일·크론·확장 API 는 세션이 없다 · 안 건드린다 */
export const config = { matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/cron|api/cc|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$).*)"] };
