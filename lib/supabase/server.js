import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

/**
 * Next 16 에서 cookies() 가 Promise 가 된다 (동기 접근은 완전 제거).
 * 14인 지금 미리 async 로 바꿔 두면 — Promise 아닌 값의 await 는 무해 —
 * 호출부 485곳의 diff 가 버전 업그레이드와 분리된다 (16 직행 2단계).
 * 호출은 반드시 `await createClient()`.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component 에서 호출되면 set 이 무시될 수 있음 — 미들웨어가 세션을 갱신함
        }
      },
    },
  });
}
