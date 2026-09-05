"use server";
/** 처음 들어오면 비밀번호 바꾸기 — 목업 00. 최소 글자 수는 v2.rule password.min_len(코드에 안 박는다). 0000 은 못 쓴다 */
import { redirect } from "next/navigation";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { ruleInt } from "@/lib/rule";
export async function changePassword(form) {
  const { sb } = await guard({ allowMustChange: true });
  const a = String(form.get("pw") ?? ""), b = String(form.get("pw2") ?? "");
  const min = await ruleInt(sb, "password.min_len");
  const bad = a !== b ? "두 칸이 다릅니다" : a.length < min ? `${min}자 이상이어야 합니다` : /^0+$/.test(a) ? "0000 처럼 같은 숫자만은 안 됩니다" : "";
  if (bad) redirect(`/password?e=${encodeURIComponent(bad)}`);
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) redirect(`/password?e=${encodeURIComponent("바꾸지 못했습니다: " + error.message)}`);
  await db(sb).rpc("password_changed");
  redirect("/");
}
