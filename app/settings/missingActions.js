"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * **목록마다 「빠졌다」 로 볼 칸을 원장님이 고른다** (원장님, 2026-08-14 —
 * 「누락 시 표시 과다 — 필수값 선택 필요. 목록마다 누락하면 안 되는 게
 * 다르니까 선택값이 필요하다는 거야」).
 *
 * 모든 빈 칸을 세면 숫자가 늘 켜져 있어 소음이 된다. 후보 칸은 각 목록의
 * NEED(코드)에 있고, 그중 무엇을 셀지만 여기 저장한다 — integrations 표의
 * "missing" 한 줄, { students: ["school", …], textbooks: […], homework: […] }.
 * 안 정한 목록은 후보 전부를 센다 (지금까지와 같다).
 */
export async function saveMissingKeys(listKey, keys) {
  if (!listKey) return { error: "목록이 없어요." };
  const supabase = createClient();
  const { data: had } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "missing")
    .maybeSingle();
  const config = { ...(had?.config || {}), [listKey]: [...new Set(keys || [])] };
  const { error } = await supabase
    .from("integrations")
    .upsert({ id: "missing", config }, { onConflict: "id" });
  revalidatePath("/students");
  revalidatePath("/textbooks");
  revalidatePath("/homework");
  return { error: error ? error.message : null };
}
