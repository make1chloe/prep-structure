/**
 * 서버에서 쓰는 Supabase 클라이언트 **한 곳** + 역할별 첫 화면 표 **한 곳**.
 *
 * 여기엔 「누구를 어디로 보내나」와 「쿠키를 어떻게 물려주나」만 산다.
 * 아이디를 이메일로 바꾸는 판단은 **여기 없다** — `lib/auth.js` 가 한다 (원칙 1).
 *
 * ⚠️ 이 파일은 `next/headers` 를 **불러오지 않는다.**
 *    미들웨어(Edge)와 서버 동작(action)이 같이 쓰는데, `next/headers` 가 한 줄이라도 들어오면
 *    미들웨어 빌드가 그 자리에서 깨진다. 그래서 쿠키는 **밖에서 넣어 준다**(getAll/setAll).
 *    검사도 이 구멍으로 가짜 쿠키를 끼운다.
 *
 * ── 지금 실제로 안 되는 것 두 가지 (2026-09-02 실측, 지어낸 말이 아니다)
 *   ① `.env.local` 에 **NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없다.** URL·서비스키·DATABASE_URL 셋뿐이다.
 *      → 이 파일이 클라이언트를 못 만든다. 로그인 화면은 뜨지만 **아무도 못 들어온다.**
 *   ② PostgREST 가 **v2 스키마를 안 내보낸다** (실측 응답: `PGRST106 · Only the following
 *      schemas are exposed: public, graphql_public`).
 *      → 로그인은 돼도 **역할을 못 읽어** 학부모·학생을 제 화면으로 못 보낸다.
 *   둘 다 코드로 못 고친다. `scripts/check-loginpage.mjs` 가 매번 이 두 줄을 세워 준다.
 */
import { createServerClient } from "@supabase/ssr";

/** v2 스키마 이름 — 문자열을 자리마다 박지 않는다 */
export const SCHEMA = "v2";

/**
 * 역할 → 로그인 첫 화면. **이 표가 유일한 한 벌이다** (원칙 1).
 * 원장·강사 `/` · 학부모 `/parent` · 학생 `/me`
 *
 * ⚠️ 그냥 객체(`{}`)가 아니라 Map 이다. 객체면 role 이 `"__proto__"`·`"constructor"` 로 올 때
 *    `HOME[role]` 이 주소가 아니라 **함수나 객체**를 돌려주고, 그게 그대로 이동 주소가 되어
 *    앱이 엉뚱한 데로 튄다. Map 은 그런 자리가 없다.
 *
 * ⚠️ `/` 는 **아직 없는 화면이다** (2026-09-02 현재 `app/page.js` 없음).
 *    원장이 로그인하면 404 를 본다 — 대시보드를 짓는 사람이 채울 자리다.
 */
export const HOME = new Map([
  ["principal", "/"],
  ["instructor", "/"],
  ["parent", "/parent"],
  ["student", "/me"],
]);

/**
 * 이 역할은 어디로 보내나.
 *
 * ⚠️ **모르는 역할은 `null` 이다 — 주소를 지어내지 않는다.**
 *    2026-09-02 이전에는 모르면 `/` 를 돌려줬다. 그런데 `/` 는 「모르겠다」 자리가 아니라
 *    **원장·강사의 첫 화면**이다(위 HOME 표). 그러면 역할 없는 학생·학부모가 `/` 로 가고,
 *    대시보드 담당이 `app/page.js` 를 놓는 날 그 아이 폰에 **원장 화면이 그대로 뜬다.**
 *    자료는 RLS 가 막아도 메뉴·구조는 열린다. 코드도 검사도 안 바뀌었는데 동작만 조용히
 *    바뀌므로 아무도 그날을 못 짚는다 — 그래서 여기서 끊는다.
 *
 * ⚠️ 받는 쪽은 **null 이면 아무 데도 안 보낸다.** `middleware.js` 의 `go()` 가
 *    주소가 아닌 값을 받으면 제자리에 둔다 — 지어낸 주소가 새어 나갈 자리를 막아 뒀다.
 *
 * @returns `"/"` · `"/parent"` · `"/me"` · **모르면 `null`**
 */
export function homeFor(role) {
  return HOME.get(String(role ?? "")) ?? null;
}

/** 아는 역할인가 — 「모르니까 안 보낸다」를 가르는 자리 */
export function knownRole(role) {
  return HOME.has(String(role ?? ""));
}

/**
 * 로그인에 쓸 열쇠. 두 이름을 다 받는다 (Supabase 가 `PUBLISHABLE` 로 이름을 바꾸는 중이다).
 * ⚠️ 서비스 열쇠(`SUPABASE_SERVICE_ROLE_KEY`)는 **여기서 절대 안 쓴다.**
 *    그걸로 로그인 클라이언트를 만들면 접근 규칙(RLS)을 통째로 지나쳐,
 *    학부모 폰에서 남의 아이 자료가 그대로 열린다.
 */
export function keys(env = process.env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = String(
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
  ).trim();
  return { url, key, ok: Boolean(url && key) };
}

/**
 * 서버 클라이언트를 만든다. 쿠키는 **밖에서** 넣어 준다.
 * @param bridge `{ getAll(), setAll(list) }` — 미들웨어는 request/response, 동작은 `cookies()`
 */
export function makeSupabase(bridge, env = process.env) {
  const { url, key, ok } = keys(env);
  if (!ok) {
    throw new Error(
      "로그인 열쇠가 없다 — .env.local 과 Vercel 에 NEXT_PUBLIC_SUPABASE_URL 과 " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY 를 넣어야 한다 (2026-09-02 실측: ANON 키가 없다)"
    );
  }
  return createServerClient(url, key, { cookies: bridge });
}

/**
 * `cookies()` 로 받은 저장소를 그대로 물려 클라이언트를 만든다 (서버 동작 · 서버 컴포넌트).
 *
 * ⚠️ 서버 **컴포넌트**에서는 쿠키를 쓸 수 없어 `set` 이 예외를 던진다. 그래서 삼킨다.
 *    삼켜도 되는 까닭은 **세션을 되살리는 일은 미들웨어가 하기 때문**이다.
 *    미들웨어를 끄면 이 삼킴이 곧바로 「한 시간 뒤에 저절로 로그아웃」으로 나타난다.
 */
export function serverClientFromStore(store, env = process.env) {
  return makeSupabase(
    {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* 서버 컴포넌트 — 위 ⚠️ 참고 */
        }
      },
    },
    env
  );
}

/**
 * 이 사람의 역할 — `v2.profiles` 에서 읽는다. **저장하지 않는다** (원칙 5: 세어 나오는 값).
 * 접근 규칙 `self_read`(id = auth.uid()) 로 자기 줄만 읽힌다 — 실측으로 확인함.
 *
 * @returns { role, state, why, msg } — 못 읽으면 role 은 **null 이고 지어내지 않는다**
 */
export async function roleById(supabase, id) {
  const r = await supabase
    .schema(SCHEMA)
    .from("profiles")
    .select("role,state")
    .eq("id", id)
    .maybeSingle();

  if (r.error) {
    const code = String(r.error.code ?? "");
    // ⚠️ 지금 실제로 나는 오류다 — 노출 설정 전에는 **늘 여기로 온다**
    if (code === "PGRST106") {
      return {
        role: null,
        state: null,
        why: "v2-not-exposed",
        msg:
          "⚠️ PostgREST 가 v2 스키마를 안 내보낸다 — 역할을 못 읽는다. " +
          "Supabase 대시보드 → Settings → API → Exposed schemas 에 v2 를 넣어야 한다",
      };
    }
    return {
      role: null,
      state: null,
      why: "read-failed",
      msg: `역할을 못 읽었다 (${code || r.error.message})`,
    };
  }
  if (!r.data) {
    // auth 에는 있는데 v2 에 줄이 없다 — 이관이 덜 됐거나 방아쇠가 public 만 겨눈 자리
    return { role: null, state: null, why: "no-row", msg: "v2.profiles 에 이 사람 줄이 없다 — 역할이 없다" };
  }
  return { role: r.data.role, state: r.data.state, why: "ok", msg: "" };
}

/** 로그인한 사람 + 역할을 한 번에 (서버 동작에서 쓴다) */
export async function roleOf(supabase) {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (error || !user) {
    return { user: null, role: null, state: null, why: "no-user", msg: "로그인 안 했다" };
  }
  return { user, ...(await roleById(supabase, user.id)) };
}
