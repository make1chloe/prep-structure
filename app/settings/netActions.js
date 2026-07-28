"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pickIp } from "@/lib/clientIp";

const NEED = "0041 SQL 을 먼저 실행해주세요.";
function unavailable(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205");
}

async function requirePrincipal(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: p } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (p?.role !== "principal") return { error: "원장 계정에서만 바꿀 수 있어요." };
  return { user };
}

/** 지금 이 화면이 어느 주소에서 열렸나 */
export async function myIp() {
  return { ip: pickIp(headers()) };
}

export async function listNet() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("academy_net")
    .select("ip, note, created_at")
    .order("created_at", { ascending: true });
  if (unavailable(error)) return { rows: [], ready: false };
  return { rows: data || [], ready: true };
}

/**
 * 지금 이 주소를 학원 주소로 등록한다.
 * 학원에서 한 번 누르면 끝이다 — 주소를 손으로 칠 일이 없다.
 */
export async function addMyIp(note) {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const ip = pickIp(headers());
  if (!ip) return { error: "주소를 읽지 못했어요." };

  const { error } = await supabase
    .from("academy_net")
    .upsert({ ip, note: (note || "").trim() || null }, { onConflict: "ip" });
  if (unavailable(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { error: null, ip };
}

export async function removeIp(ip) {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };
  const { error } = await supabase.from("academy_net").delete().eq("ip", ip);
  revalidatePath("/settings");
  return { error: error ? error.message : null };
}
