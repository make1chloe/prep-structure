import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request) {
  return await updateSession(request);
}

// 로고·달력·manifest 는 **아예 여기까지 오지도 않게** 뺀다.
// (lib/supabase/middleware 안에서도 한 번 더 열어둔다 — 이 정규식 하나에
//  기대고 있다가 아이폰 홈 화면 아이콘이 몇 주 동안 「클」 글자로 떴다)
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/icon|api/calendar|manifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
