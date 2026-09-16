/** 로그인 확인 한 벌(속도 대원칙 2) — 쿠키의 세션을 읽는다. auth.getUser() 는 부를 때마다 인증 서버 왕복이라 금지.
 *  검증은 DB(RLS)가 한다 — 세션이 가짜면 표가 한 줄도 안 준다. */
import { redirect } from "next/navigation";
import { supabase, db } from "./supabase.js";
import { isStaff } from "./roles.js";

export async function sessionUser(sb) {
  try { const { data: { session } } = await sb.auth.getSession(); return session?.user ?? null; }
  catch { return null; }
}

/** 지금 누구인가 · 세션 + v2.profiles 한 줄. 표에 줄이 없으면 me 가 null 이다(로그인은 됐지만 사람 줄이 없는 것 · 첫 화면이 잇는 길을 말한다, (어36)).
 *  조회 오류는 삼키지 않는다(err) · 줄이 없는 것과 못 읽은 것은 다른 일이다 */
export async function whoami() {
  const sb = await supabase();
  const user = await sessionUser(sb);
  if (!user) return { sb, user: null, me: null, err: null };
  const { data, error } = await db(sb).from("profiles").select("id,role,name,state,must_change_pw").eq("id", user.id).maybeSingle();
  if (error) console.error("[세션] 사람 줄을 못 읽음:", error.message);
  return { sb, user, me: data ?? null, err: error?.message ?? null };
}

/** 화면 머리에서 한 번 — 로그인 없으면 /login, 비밀번호 안 바꿨으면 /password(목업 00 「안 바꾸면 다음 화면으로 못 갑니다」) */
export async function guard({ allowMustChange = false } = {}) {
  const w = await whoami();
  if (!w.user) redirect("/login");
  if (w.me?.must_change_pw && !allowMustChange) redirect("/password");
  return w;
}

/** 학원 사람(원장·선생님·조교)만 쓰는 손의 문지기 한 벌 · (어41) 손 파일 열 곳이 같은 두 줄을 베끼고 있었다(원칙-1). 아니면 「권한 없음」 */
export async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("권한 없음"); return w; }
