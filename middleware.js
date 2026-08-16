import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request) {
  return await updateSession(request);
}

// 로고·달력·manifest·알림 조각은 **아예 여기까지 오지도 않게** 뺀다.
// (lib/supabase/middleware 안에서도 한 번 더 열어둔다 — 이 정규식 하나에
//  기대고 있다가 아이폰 홈 화면 아이콘이 몇 주 동안 「클」 글자로 떴다)
//
// **sw.js 를 빠뜨리고 있었다** (2026-08-07). 학생·학부모가 부르면 자기
// 화면으로 되돌려보내서 서비스워커가 등록되지 않았고, 그 폰들은 알림을
// 받을 수가 없었다 — 오류는 아무 데도 안 났다.
export const config = {
  // api/cron(바깥 시계)·api/classcard(크롬 확장)는 로그인 쿠키가 없는
  // 호출이다 — 미들웨어가 로그인으로 돌려보내면 열쇠 검사까지 가지도
  // 못한다 (2026-08-17 실제로 「Redirecting...」 만 나왔다).
  // 주석을 배열 안에 두면 check-public 이 matcher 를 못 읽는다 — 밖에 둔다.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|api/icon|api/calendar|api/cron|api/classcard|manifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
