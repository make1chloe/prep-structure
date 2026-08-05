"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 홈 화면 아이콘 — 원장님이 올린 로고를 담아둔다 (0080).
 *
 * 크기 맞추기·여백 주기는 **브라우저에서** 끝낸 뒤 온다. 서버에 그림 다루는
 * 도구를 들이지 않으려는 것이다 — 그것 하나 때문에 배포가 무거워진다.
 * 여기서는 받은 것을 담고, 이상한 것이 오면 거절한다.
 */

const KEYS = ["icon-192", "icon-512", "icon-192m", "icon-512m", "icon-apple", "icon-favicon"];
const MAX = 400 * 1024;   // 한 장 400KB — 아이콘이 이보다 크면 뭔가 잘못된 것이다

async function requirePrincipal(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (p?.role !== "principal") return { error: "원장 계정에서만 바꿀 수 있어요." };
  return { error: null, user };
}

const SQL = "0080 SQL 을 먼저 실행해주세요.";

/** 지금 올려둔 것이 있나 */
export async function iconStatus() {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };
  const { data, error } = await supabase
    .from("app_assets").select("key, updated_at").in("key", KEYS);
  if (error) return { error: SQL };
  return {
    error: null,
    uploaded: (data || []).length === KEYS.length,
    updatedAt: (data || [])[0]?.updated_at || null,
  };
}

/**
 * 올린다.
 * @param images { "icon-512": "data:image/png;base64,...", ... }
 */
export async function saveIcons(images = {}) {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return guard;

  const rows = [];
  for (const key of KEYS) {
    const url = images[key];
    if (typeof url !== "string" || !url.startsWith("data:image/png;base64,")) {
      return { error: `${key} 그림이 빠졌어요. 다시 올려주세요.` };
    }
    const b64 = url.slice("data:image/png;base64,".length);
    if (b64.length * 0.75 > MAX) {
      return { error: "그림이 너무 큽니다. 로고 파일을 조금 작게 해주세요." };
    }
    rows.push({
      key,
      mime: "image/png",
      data: b64,
      updated_at: new Date().toISOString(),
      updated_by: guard.user.id,
    });
  }

  const { error } = await supabase.from("app_assets").upsert(rows, { onConflict: "key" });
  if (error) return { error: error.message.includes("app_assets") ? SQL : error.message };

  revalidatePath("/settings/screen");
  return { error: null };
}

/** 다시 기본 그림으로 (올린 것을 지운다) */
export async function clearIcons() {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return guard;
  const { error } = await supabase.from("app_assets").delete().in("key", KEYS);
  revalidatePath("/settings/screen");
  return { error: error ? error.message : null };
}
