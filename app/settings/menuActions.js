"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 메뉴를 내 손에 맞게 (0067).
 *
 * 사람마다 매일 여는 화면이 다르다. 원장님과 조교 선생님이 같을 리 없다.
 * 그래서 **내 계정에만** 저장한다.
 *
 * 숨긴 화면도 주소로는 그대로 열린다 — 메뉴에서만 빠진다. 실수로 숨겨도
 * 갇히지 않는다.
 */
export async function saveMenuPrefs(hidden, order) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const row = {
    menu_hidden: [...new Set((hidden || []).filter(Boolean))],
    menu_order: [...new Set((order || []).filter(Boolean))],
  };
  const { error } = await supabase.from("profiles").update(row).eq("id", user.id);
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return { error: "설정 → Supabase SQL 에서 0067 을 먼저 실행해주세요." };
    }
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

/** 처음 상태로 — 전부 보이고, 원래 순서로 */
export async function resetMenuPrefs() {
  return saveMenuPrefs([], []);
}
