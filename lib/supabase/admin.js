// **서버만 아는 열쇠**로 여는 클라이언트 (RLS 를 넘는다).
//
// 외부 시계(한 시간마다 주소를 두드리는 크론)가 예약 발송을 내보낼 때
// 쓴다 — 크론에는 로그인 쿠키가 없어서 보통 클라이언트로는 RLS 에 다
// 막힌다. 이 열쇠는 브라우저로 절대 안 내려간다 (서버 파일에서만 import).
// 이름 몇 가지를 받아주는 것은 app/apply/notify.js 와 같은 까닭.

import { createClient as createJsClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

const NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SERVICE_ROLE_KEY",
];

export function adminClient() {
  for (const n of NAMES) {
    const key = (process.env[n] || "").trim();
    if (key) {
      return createJsClient(SUPABASE_URL, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }
  return null;   // 열쇠가 없으면 크론은 못 돈다 — 앱 열 때는 그대로 나간다
}
