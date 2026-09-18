"use server";
/** 처음 들어오면 비밀번호 바꾸기 — 목업 00. 최소 글자 수는 v2.rule password.min_len(코드에 안 박는다). 첫 비밀번호 그대로는 못 쓴다 */
import { redirect } from "next/navigation";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { saidBy } from "@/lib/sqlError";
import { ruleInt } from "@/lib/rule";
import { homeFor } from "@/lib/menu";
import { FIRST_PW } from "@/lib/student-plan";   // 첫 비밀번호는 한 곳((어65))
/** 까닭을 달고 이 화면으로 되돌아간다. redirect 는 **던지는** 것이라 try 안에서 부르면 catch 가 삼킨다 — 그래서 갈 곳만 정하고 맨 끝에서 한 번 부른다((어71)) */
const back = (why) => `/password?e=${encodeURIComponent(why)}`;
export async function changePassword(form) {
  const { sb, me } = await guard({ allowMustChange: true });
  const a = String(form.get("pw") ?? ""), b = String(form.get("pw2") ?? "");
  let go;
  try {
    const min = await ruleInt(sb, "password.min_len");
    const bad = a !== b ? "두 칸이 다릅니다" : a.length < min ? `${min}자 이상이어야 합니다` : /^(\d)\1*$/.test(a) ? `${FIRST_PW} 처럼 같은 숫자만은 안 됩니다` : "";
    go = bad ? back(bad) : await change(sb, me, a);
  } catch (e) { go = back(saidBy(e?.message ?? String(e))); }   // 규칙 줄이 없거나 표가 없어도 **조용히 그대로 있지 않는다**(대전제-0)
  redirect(go);
}
/** 바꾸고 · 표시를 내리고 · **정말 내려갔는지 다시 읽는다**. 셋 중 하나만 어긋나도 다음 화면의 문지기가 여기로 되돌려서
 *  화면이 안 넘어간 것처럼 보였다((어71) 원장님 2026-09-17 「여기서 화면이 안넘어감」). 걸린 자리마다 까닭을 말한다 */
async function change(sb, me, pw) {
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) return back("바꾸지 못했습니다: " + error.message);
  const { error: e1 } = await db(sb).rpc("password_changed");   // 결과를 본다 — supabase 는 오류를 던지지 않고 돌려준다(안 보면 조용히 지나간다)
  if (e1) return back("비밀번호는 바뀜 · 「처음 비밀번호」 표시를 못 삭제함: " + saidBy(e1.message));
  if (!me?.id) return homeFor(me?.role);
  const { data, error: e2 } = await db(sb).from("profiles").select("must_change_pw").eq("id", me.id).maybeSingle();
  if (e2) return back("비밀번호는 바뀜 · 내려갔는지 확인 못 함: " + saidBy(e2.message));
  if (data?.must_change_pw) return back("비밀번호는 바뀜 · 「처음 비밀번호」 표시가 그대로라 다음 화면이 다시 여기로 되돌림 · 붙여넣기 SQL docs/sql-paste/0173.sql 을 넣은 뒤 다시");
  return homeFor(me.role);   // 아이는 /me
}
