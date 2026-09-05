"use server";
/** 켜고 끄기 — 원장만. 표(v2.role_access)의 RLS 도 원장만 받으니 여기서 한 번 더 막는 것은 「말」을 위해서다 */
import { revalidatePath } from "next/cache";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { ROLES } from "@/lib/roles";
import { KEYS } from "@/lib/perm";
export async function setAccess(form) {
  const { sb, me } = await guard();
  if (me?.role !== ROLES.PRINCIPAL) return;
  const role = String(form.get("role")), key = String(form.get("key")), allowed = form.get("allowed") === "1";
  if (!KEYS.some((k) => k.key === key && k.roles.includes(role))) return;   // 열쇠 목록의 주인은 lib/perm.js
  const { error } = await db(sb).from("role_access").upsert({ role, key, allowed });
  if (error) throw new Error(`못 저장함: ${error.message}`);
  revalidatePath("/settings/access"); revalidatePath("/");
}
