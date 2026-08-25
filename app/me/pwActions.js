"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/session";

/**
 * 학생이 처음 들어와서 비밀번호를 정한다.
 *
 * 예전에는 브라우저가 비밀번호를 바꾸고, 그다음에 "바꿨어요" 라고 서버에
 * 알려주는 방식이었다. 그러면 **비밀번호를 안 바꾸고 깃발만 내릴 수 있다.**
 * 0000 인 채로 남는데 화면은 다 바꾼 것처럼 보인다.
 *
 * 그래서 **서버가 직접 바꾼다.** 진짜로 바뀌어야 깃발이 내려간다.
 *   · 부르는 사람이 자기 자신인지 서버에서 확인한다
 *   · 0000 은 거절한다 (그게 이 화면의 이유다)
 *   · 바꾸는 것과 깃발을 내리는 것이 한 자리에 있다
 *
 * service_role 열쇠가 없는 동안에는 예전 방식으로 돌아간다 — 아이가 화면
 * 앞에서 막혀버리면 안 되기 때문이다.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const INIT_PW = "0000";

async function serviceKey(supabase) {
  const { data } = await supabase
    .from("integrations").select("config").eq("id", "supabase_service").maybeSingle();
  return (data?.config?.key || "").trim();
}

/** 서버에서 바로 바꾼다. 열쇠가 없으면 못 했다고 알려준다 */
export async function setMyPassword(newPw) {
  const pw = (newPw || "").toString();
  if (pw.length < 4) return { error: "네 자리 이상으로 정해주세요." };
  if (pw === INIT_PW) return { error: "0000 말고 다른 것으로 정해주세요." };

  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (!user) return { error: "다시 로그인해주세요." };

  const key = await serviceKey(supabase);
  if (!key || !SUPABASE_URL) return { error: null, byServer: false };

  // 부르는 사람 자신의 것만 바꾼다 — id 를 밖에서 받지 않는다
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: pw }),
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.msg || msg; } catch { /* 본문이 없을 수도 있다 */ }
    return { error: `비밀번호를 바꾸지 못했어요: ${msg}` };
  }

  // 진짜로 바뀐 다음에만 깃발을 내린다
  const { error } = await supabase.rpc("clear_must_change_pw");
  if (error && (error.code === "PGRST202" || error.code === "42883")) {
    return { error: "선생님이 0045 SQL 을 먼저 실행해야 해요." };
  }
  revalidatePath("/me");
  revalidatePath("/parent");     // 학부모도 이 화면을 지나야 아이 화면이 열린다
  return { error: error ? error.message : null, byServer: true };
}

/**
 * 비밀번호를 바꿨다고 표시한다 (열쇠가 없을 때 쓰는 예전 길).
 * 브라우저가 먼저 바꾸고 부르므로, 여기서는 깃발만 내린다.
 */
export async function pwChanged() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_must_change_pw");
  if (error && (error.code === "PGRST202" || error.code === "42883")) {
    return { error: "선생님이 0045 SQL 을 먼저 실행해야 해요." };
  }
  revalidatePath("/me");
  revalidatePath("/parent");
  return { error: error ? error.message : null };
}
