/** 로그인 확인 한 벌(속도 대원칙 2) — 쿠키의 세션을 읽는다. auth.getUser() 는 부를 때마다 인증 서버 왕복이라 금지.
 *  검증은 DB(RLS)가 한다 — 세션이 가짜면 표가 한 줄도 안 준다. */
import { redirect } from "next/navigation";
import { supabase, db } from "./supabase.js";

export async function sessionUser(sb) {
  try { const { data: { session } } = await sb.auth.getSession(); return session?.user ?? null; }
  catch { return null; }
}

/** 지금 누구인가 — 세션 + v2.profiles 한 줄. 표에 줄이 없으면 me 가 null 이다(로그인은 됐지만 사람 줄이 없는 것 — 원장님께 뜬다) */
export async function whoami() {
  const sb = await supabase();
  const user = await sessionUser(sb);
  if (!user) return { sb, user: null, me: null };
  const { data } = await db(sb).from("profiles").select("id,role,name,state,must_change_pw").eq("id", user.id).maybeSingle();
  return { sb, user, me: data ?? null };
}

/** 화면 머리에서 한 번 — 로그인 없으면 /login, 비밀번호 안 바꿨으면 /password(목업 00 「안 바꾸면 다음 화면으로 못 갑니다」) */
export async function guard({ allowMustChange = false } = {}) {
  const w = await whoami();
  if (!w.user) redirect("/login");
  if (w.me?.must_change_pw && !allowMustChange) redirect("/password");
  return w;
}
