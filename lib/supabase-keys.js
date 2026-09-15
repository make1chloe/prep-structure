/** 로그인 키 읽기 한 벌 · 화면·서버 액션(lib/supabase.js)과 미들웨어(middleware.js · 엣지)가 같이 쓴다. next/headers 를 안 물어 어디서든 든다 */
export function keys(env = process.env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return { url, key, ok: Boolean(url && key) };
}
