/** Supabase 손 한 벌 — 화면·서버 액션은 supabase()(쿠키의 세션), 크론은 serviceClient()(서버 자신).
 *  스키마는 v3 하나(SCHEMA). 열쇠가 없으면 조용히 빈 화면을 그리지 않고 던진다(대전제-0). */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const SCHEMA = "v3";

export function keys(env = process.env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return { url, key, ok: Boolean(url && key) };
}

/** 서버(화면·서버 액션)에서 — 쿠키의 세션으로 붙는다. 쿠키 쓰기는 서버 액션·라우트에서만 되므로 화면에서는 조용히 넘긴다 */
export async function supabase() {
  const { url, key, ok } = keys();
  if (!ok) throw new Error("로그인 열쇠가 없다 — NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 .env.local 과 Vercel 에");
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { for (const { name, value, options } of list) store.set(name, value, options); } catch {} },
    },
  });
}

/** 표에 붙는 손 — 스키마를 여기서 한 번만 정한다. 화면이 .schema("v3") 를 따로 적지 않는다 */
export const db = (sb) => sb.schema(SCHEMA);

/** 크론 — 사람이 아닌 서버 자신. 열쇠(SUPABASE_SERVICE_ROLE_KEY)는 서버에만 있다. 없으면 던진다 */
export function serviceClient(env = process.env) {
  const { url } = keys(env);
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("서버 열쇠가 없다 — SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
