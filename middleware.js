/**
 * 문지기 — **로그인 안 했으면 `/login`, 했으면 역할별 첫 화면.**
 *
 * 판단은 여기 없다. 「누구를 어디로」는 `lib/supabase-server.js` 의 `HOME` 표 한 벌뿐이고,
 * 「친 글자를 이메일로」는 `lib/auth.js` 한 곳뿐이다. 여기는 **길만 튼다.**
 *
 * ⚠️ 매 요청마다 `auth.getUser()` 를 한 번 부른다 (Supabase 인증 서버 왕복 1회).
 *    이게 세션을 되살리는 유일한 자리다 — 빼면 한 시간쯤 뒤에 다들 저절로 로그아웃된다.
 *
 * ⚠️⚠️ **여기는 「첫 화면」만 고른다 — 역할로 화면을 지키지 않는다.**
 *    `/` 와 `/login` 밖의 주소는 **로그인만 했으면 누구나 연다.**
 *    실측 2026-09-02(진짜 `middleware()` 를 노드로 돌림) — 학생 세션으로 `GET /parent` → **200**,
 *    학부모 세션으로 `GET /me` → **200**. 지금은 두 화면이 「준비 중입니다」 껍데기라 새는 자료가 없다.
 *    **`/me`·`/parent` 를 채우는 사람이 스스로 역할을 봐야 한다.** 문지기가 봐준다고 믿고 지으면,
 *    그날 학생 폰에서 학부모 화면이 그대로 열린다 (서비스 열쇠를 쓰면 남의 아이 자료까지).
 */
import { NextResponse } from "next/server";
import { keys, makeSupabase, roleById, homeFor, knownRole } from "@/lib/supabase-server";

/**
 * ⚠️ 비켜 가야 하는 것들 — 하나라도 빠뜨리면 그 자리가 조용히 죽는다.
 *   `sw.js`      서비스워커. 로그인 화면 HTML 로 갈아치우면 **그 폰의 알림 구독이 죽는다**
 *                (next.config.mjs 의 경고와 같은 자리다)
 *   `api/`       API 를 `/login` 으로 되돌리면 앱이 JSON 대신 HTML 을 받아 알 수 없는 오류가 난다.
 *                ⚠️ 그래서 **API 는 스스로 로그인 확인을 해야 한다** — 문지기가 안 봐준다.
 *                ⚠️ **그리고 지금 그걸 지키는 API 가 하나도 없다** (실측 2026-09-02):
 *                `app/api/push/seen/route.js` 는 쿠키를 한 줄도 안 보고 곧바로
 *                `serviceDb().rpc("mark_notify_seen", …)` 를 부른다 — 서비스 열쇠라 RLS 를 통째로
 *                지나간다. 지금은 v2 미노출이라 죽지만, 전환일부터는 쿠키 없이 아무나 남의 알림을
 *                「읽음」으로 바꿀 수 있다 → 「전 기기가 새 SW 로 넘어갔다」 판정이 틀어진다.
 *                **API 담당 자리다** (이 파일에서 못 고친다 — 여기서 막으면 JSON 자리에 HTML 이 간다).
 *   `manifest`   설치 정보. 막히면 홈화면 추가가 안 된다
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|sw\\.js|manifest\\.json|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};

const LOGIN = "/login";

export async function middleware(request) {
  const path = request.nextUrl.pathname;
  const onLogin = path === LOGIN;

  // ⚠️ 열쇠가 없으면 아무도 로그인할 수 없다. 그래도 **문은 잠근 채로** 로그인 화면으로 보낸다
  //    (열어 두면 로그인 없이 화면이 그냥 열린다 — 자료는 RLS 가 막지만 화면은 열린다).
  if (!keys().ok) return onLogin ? NextResponse.next() : go(request, LOGIN);

  let res = NextResponse.next({ request });
  const supabase = makeSupabase({
    getAll: () => request.cookies.getAll(),
    // ⚠️ 되살린 쿠키를 **요청과 응답 둘 다에** 실어야 한다. 한쪽만 실으면
    //    이번 요청은 로그인된 척하고 다음 요청에서 풀려 — 로그인/로그아웃이 번갈아 나는 고리가 된다.
    setAll: (list) => {
      list.forEach(({ name, value }) => request.cookies.set(name, value));
      res = NextResponse.next({ request });
      list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  // ── 안 했으면 로그인 화면으로
  if (!user) return onLogin ? res : go(request, LOGIN, res);

  // ── 했으면 역할별 첫 화면으로. 역할은 **필요할 때만** 읽는다 (매번 읽으면 왕복이 두 배가 된다)
  if (onLogin) {
    // ⚠️ 탈출구 — `/login?switch=1` 은 되돌리지 않는다.
    //    이게 없으면 남의 계정으로 로그인된 폰은 **로그아웃할 방법이 아예 없다**
    //    (지금 앱의 다른 화면에 로그아웃 단추가 아직 없다). 원장님 리허설에 꼭 필요하다.
    if (request.nextUrl.searchParams.get("switch") === "1") return res;
    const { role } = await roleById(supabase, user.id);
    // ⚠️⚠️ **역할을 모르면 되돌리지 않는다 — 로그인 화면을 그대로 준다.**
    //    되돌리면 `homeFor(null)` 이 없는 `/` 로 가고, 거기서 `/login` 을 다시 열어도
    //    또 `/` 로 되돌아온다. 실측(2026-09-02, 진짜 middleware 를 노드로 돌림):
    //    `POST /login` → `/` → **404** → `GET /login` → `/` → 404. **무한이다.**
    //    홈 화면에 깐 앱에는 주소창도 뒤로가기도 없어(대전제 10) 스스로 빠져나올 길이 없다.
    //    로그인 화면에는 로그아웃 단추가 있으니, 여기 세워 두면 적어도 나갈 수는 있다.
    if (!knownRole(role)) return res;
    return go(request, homeFor(role), res);
  }

  // 뿌리에 온 학부모·학생만 제 화면으로 옮겨 준다.
  if (path === "/") {
    const { role, why } = await roleById(supabase, user.id);
    if (knownRole(role)) {
      const home = homeFor(role);
      if (home !== "/") return go(request, home, res);
      return res;
    }
    // ⚠️ `/` 는 「모르겠다」 자리가 아니라 **원장·강사 첫 화면**이다.
    //    역할이 **정말 없는 사람**(`v2.profiles` 에 줄이 없다 — 실측 3명)을 여기 두면,
    //    대시보드 담당이 `app/page.js` 를 놓는 날 그 학생·학부모 폰에 원장 화면이 뜬다.
    //    → 로그인 화면으로 보낸다. 거기서 다시 로그인해 보면 까닭이 글로 뜬다(app/login/actions.js).
    //    고리는 안 난다 — 위 `onLogin` 이 역할 모르는 사람을 로그인 화면에 그대로 세운다.
    if (why === "no-row") return go(request, LOGIN, res);
    // ⚠️ 못 읽은 까닭이 **설정·연결 탈**(v2 미노출·읽기 실패)이면 **안 옮긴다.**
    //    그건 그 사람 탓이 아니라 전원에게 나는 일이라, 옮기면 원장님까지 대시보드에서 쫓겨난다.
  }

  return res;
}

/**
 * 다른 자리로 보낸다.
 * ⚠️ 네 가지를 안 지키면 그날 아무도 못 들어온다:
 *   ① 되살린 세션 쿠키를 **옮겨 실어야** 한다 — 안 실으면 보내자마자 다시 로그아웃이다
 *   ② **같은 자리로 보내지 않는다** — `/login` 에서 `/login` 으로 보내면 브라우저가 고리에 빠진다
 *   ③ **갈 곳을 모르면(`null`) 아무 데도 안 보낸다** — `homeFor` 가 모르는 역할에 null 을 준다.
 *      막아 두지 않으면 `url.pathname = null` 이 `/null` 이 되어 엉뚱한 404 로 날아간다
 *   ④ **303 이다. 307 이 아니다.**
 */
function go(request, to, carry) {
  if (typeof to !== "string" || !to.startsWith("/")) return carry ?? NextResponse.next(); // ③
  if (to === request.nextUrl.pathname) return carry ?? NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = to;
  url.search = ""; // ⚠️ 물음표 뒤는 버린다 — 전화번호 같은 것이 주소에 실려 남지 않게
  // ⚠️⚠️ **303 을 반드시 준다.** `NextResponse.redirect(url)` 의 기본은 **307**이고,
  //    307 은 메서드를 유지한다 → 로그인된 폰에서 로그인 폼을 한 번 더 내면(뒤로가기로 되살아난
  //    화면, 느린 폰에서 두 번 누름) 브라우저가 그 **POST 를 `/parent` 로 그대로 다시 보낸다.**
  //    실측 2026-09-02 — 응답이 `500` 이고 서버 로그는 `Failed to find Server Action …`.
  //    303 이면 브라우저가 GET 으로 바꿔 가서 그 화면이 정상으로 열린다 (GET 이동에도 안전하다).
  const r = NextResponse.redirect(url, 303);
  carry?.cookies.getAll().forEach((c) => r.cookies.set(c));
  return r;
}
