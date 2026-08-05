"use server";

import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

/**
 * 구글 캘린더 구독 주소 (0078).
 *
 * 구글은 로그인 없이 이 주소를 부르므로, 주소에 붙은 **긴 열쇠**가 곧 자물쇠다.
 * 그래서 열쇠를 아는 사람은 일정을 볼 수 있다 — 새로 발급하면 옛 주소는
 * 그 자리에서 죽는다.
 */

async function requireStaff(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["principal", "instructor", "assistant"].includes(p?.role)) {
    return { error: "선생님만 쓸 수 있어요." };
  }
  return { error: null, user };
}

const SQL = "0078 SQL 을 먼저 실행해주세요.";

export async function getCalendarToken() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { token: null, error: guard.error };

  const { data, error } = await supabase
    .from("calendar_tokens")
    .select("token, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return { token: null, error: SQL };
  return { token: data?.[0]?.token || null, error: null };
}

/** 새로 발급 — 옛 주소는 그 자리에서 죽는다 */
export async function newCalendarToken() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { token: null, error: guard.error };

  const token = randomBytes(24).toString("base64url");
  await supabase.from("calendar_tokens").delete().neq("token", token);
  const { error } = await supabase
    .from("calendar_tokens")
    .insert({ token, label: "구글 캘린더", created_by: guard.user.id });
  if (error) return { token: null, error: SQL };
  return { token, error: null };
}
