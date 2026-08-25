"use server";

import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";

const SQL = "0078 SQL 을 먼저 실행해주세요.";

export async function getCalendarToken() {
  const supabase = await createClient();
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
  const supabase = await createClient();
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
