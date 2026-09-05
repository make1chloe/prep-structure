"use server";
/** 로그인 — 아이디를 이메일로 바꾸는 규칙은 lib/roles.js 한 벌. 실패하면 비밀번호는 절대 되돌려보내지 않는다 */
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toLoginEmail } from "@/lib/roles";
export async function signIn(form) {
  const kind = String(form.get("kind") ?? ""), id = String(form.get("id") ?? ""), password = String(form.get("password") ?? "");
  const conv = toLoginEmail(kind, id);
  if (!conv.ok) redirect(`/login?e=${encodeURIComponent(conv.msg)}&k=${kind}`);
  const sb = await supabase();
  const { error } = await sb.auth.signInWithPassword({ email: conv.email, password });
  if (error) {
    const m = /invalid login|invalid_grant|credentials/i.test(error.message) ? "아이디 또는 비밀번호가 맞지 않습니다" : /email not confirmed/i.test(error.message) ? "계정이 아직 열리지 않았습니다. 원장님께 알려 주세요" : "들어갈 수 없습니다. 잠시 뒤 다시 해 보세요";
    redirect(`/login?e=${encodeURIComponent(m)}&k=${kind}`);
  }
  redirect("/");
}
