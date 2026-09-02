import { createClient } from "@supabase/supabase-js";

/** 서비스 열쇠 — **접근 규칙을 지나치지 않는다.** 사람 대신 서버가 하는 일에만 쓴다
 *  (알림 자취 회신 · 크론 · 이관). 화면에서 부르면 그 화면이 규칙 밖으로 나간다. */
export function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 열쇠가 없다 — .env.local 을 본다");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "v2" },
  });
}
