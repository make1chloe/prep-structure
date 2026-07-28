"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/env";

/**
 * 학생 계정을 원장님이 직접 만들어 준다.
 *
 * 아이들은 이메일 주소도 비밀번호도 잊어버린다. 그래서 학원이 아이디를 준다.
 *   아이디  chloe0001  (재원생 목록에서 뽑는다)
 *   비번    0000       (처음 들어오면 학생이 바꾼다)
 * 또 잊으면 원장님이 0000 으로 되돌린다.
 *
 * Supabase 로그인은 이메일만 받으므로 아이디에 도메인을 붙여 속으로만
 * 이메일을 만든다. 학생은 그런 게 있는지도 모른다.
 *
 * 계정을 만들려면 service_role 키가 필요하다. 이 키는 **설정 화면에서
 * 직접 넣어** integrations 에 담기고, 서버에서만 읽는다.
 * 화면에도 대화에도 나오지 않는다.
 */

const DOMAIN = "chloe-eng.internal";     // 실제로 메일이 가는 곳이 아니다
const INIT_PW = "0000";

function emailOf(loginId) {
  return `${(loginId || "").trim().toLowerCase()}@${DOMAIN}`;
}

async function requirePrincipal(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["principal", "instructor"].includes(p?.role)) {
    return { error: "선생님 계정에서만 할 수 있어요." };
  }
  return { error: null };
}

/** 설정에 넣어둔 service_role 키 */
async function serviceKey(supabase) {
  const { data } = await supabase
    .from("integrations").select("config").eq("id", "supabase_service").maybeSingle();
  return (data?.config?.key || "").trim();
}

async function admin(key, path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let json = null;
  try { json = await res.json(); } catch { /* 본문이 없을 수도 있다 */ }
  return { ok: res.ok, status: res.status, json };
}

function keyMissing() {
  return {
    error:
      "학생 계정을 만들려면 Supabase service_role 키가 필요해요. " +
      "설정 → 학생 계정 키 에 넣어주세요 (대화창에는 절대 붙여넣지 마세요).",
  };
}

/** 아직 안 쓴 아이디를 만든다 — chloe + 네 자리 */
async function freeLoginId(supabase) {
  const { data } = await supabase
    .from("students").select("login_id").not("login_id", "is", null);
  const used = new Set((data || []).map((x) => (x.login_id || "").toLowerCase()));
  for (let n = 1; n < 10000; n += 1) {
    const id = `chloe${String(n).padStart(4, "0")}`;
    if (!used.has(id)) return id;
  }
  return `chloe${Date.now().toString().slice(-6)}`;
}

/**
 * 계정을 만든다.
 * 이미 아이디가 있으면 그대로 두고 비밀번호만 0000 으로 되돌린다.
 */
export async function createStudentLogin(studentId, wantId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return guard;

  const key = await serviceKey(supabase);
  if (!key) return keyMissing();

  const { data: s } = await supabase
    .from("students").select("id, name, login_id, profile_id").eq("id", studentId).maybeSingle();
  if (!s) return { error: "학생을 찾을 수 없어요." };
  if (s.profile_id) return { error: "이미 계정이 있어요. 비밀번호 초기화를 쓰세요." };

  const loginId = (wantId || "").trim().toLowerCase() || s.login_id || (await freeLoginId(supabase));
  if (!/^[a-z0-9._-]{4,30}$/.test(loginId)) {
    return { error: "아이디는 영문·숫자로 4~30자여야 해요." };
  }

  const made = await admin(key, "/users", "POST", {
    email: emailOf(loginId),
    password: INIT_PW,
    email_confirm: true,
    user_metadata: { name: s.name, login_id: loginId },
  });
  if (!made.ok) {
    const msg = made.json?.msg || made.json?.message || `HTTP ${made.status}`;
    if (made.status === 401 || made.status === 403) {
      return { error: `키가 맞지 않아요 (${msg}). 설정에서 service_role 키를 다시 넣어주세요.` };
    }
    if (/already|registered|exists/i.test(msg)) {
      return { error: `이미 쓰고 있는 아이디예요 (${loginId}). 다른 아이디로 해주세요.` };
    }
    return { error: `계정을 만들지 못했어요: ${msg}` };
  }

  const uid = made.json?.id;
  if (!uid) return { error: "계정은 만들어졌는데 id 를 못 받았어요." };

  // profiles 는 트리거가 만들지만, 없을 수도 있으니 확실히 해둔다
  await supabase.from("profiles").upsert(
    { id: uid, name: s.name, role: "student", must_change_pw: true },
    { onConflict: "id" }
  );
  const { error } = await supabase
    .from("students").update({ login_id: loginId, profile_id: uid }).eq("id", studentId);
  if (error) return { error: error.message };

  revalidatePath("/students");
  return { error: null, loginId, password: INIT_PW };
}

/** 비밀번호를 0000 으로 되돌린다 (아이가 잊었을 때) */
export async function resetStudentPassword(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return guard;

  const key = await serviceKey(supabase);
  if (!key) return keyMissing();

  const { data: s } = await supabase
    .from("students").select("profile_id, login_id").eq("id", studentId).maybeSingle();
  if (!s?.profile_id) return { error: "아직 계정이 없어요." };

  const res = await admin(key, `/users/${s.profile_id}`, "PUT", { password: INIT_PW });
  if (!res.ok) {
    const msg = res.json?.msg || res.json?.message || `HTTP ${res.status}`;
    return { error: `비밀번호를 바꾸지 못했어요: ${msg}` };
  }

  // 다음에 들어오면 바로 바꾸게 한다
  await supabase.from("profiles").update({ must_change_pw: true }).eq("id", s.profile_id);

  revalidatePath("/students");
  return { error: null, loginId: s.login_id, password: INIT_PW };
}

/** 지금 상태 — 아이디가 있나, 계정이 붙어 있나 */
export async function accountStatus(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = createClient();
  const { data: s, error } = await supabase
    .from("students").select("login_id, profile_id").eq("id", studentId).maybeSingle();
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return { error: "0045 SQL 을 먼저 실행해주세요." };
    }
    return { error: error.message };
  }

  let mustChange = false;
  if (s?.profile_id) {
    const { data: p } = await supabase
      .from("profiles").select("must_change_pw").eq("id", s.profile_id).maybeSingle();
    mustChange = !!p?.must_change_pw;
  }

  const key = await serviceKey(supabase);
  return {
    error: null,
    loginId: s?.login_id || null,
    linked: !!s?.profile_id,
    mustChange,
    hasKey: !!key,
    suggest: s?.login_id || (await freeLoginId(supabase)),
  };
}
