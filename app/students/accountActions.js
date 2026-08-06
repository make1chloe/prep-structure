"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parentLoginId } from "@/lib/studentId";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { baseLoginId, resolveLoginId } from "@/lib/studentId";

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

/**
 * 아이디를 정한다 — chloe + 전화 뒷자리 (lib/studentId.js 의 규칙 그대로).
 *
 * 아이가 외우기 쉬워야 한다. 자기 번호 뒷자리면 잊어도 다시 떠올린다.
 * 겹치면 -2, -3 을 붙이고, 번호 자체가 없으면 chloe0001 부터 차례로 준다.
 */
function pickId(student = {}, used) {
  const base = baseLoginId(student.student_phone, student.parent_phone);
  if (base) {
    const id = resolveLoginId(base, used);
    used.add(id);
    return id;
  }
  for (let n = 1; n < 10000; n += 1) {
    const id = `chloe${String(n).padStart(4, "0")}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  return `chloe${Date.now().toString().slice(-6)}`;
}

/** 지금 쓰고 있는 아이디 전부 */
async function usedIds(supabase) {
  const { data } = await supabase
    .from("students").select("login_id").not("login_id", "is", null);
  return new Set((data || []).map((x) => (x.login_id || "").toLowerCase()));
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
    .from("students")
    .select("id, name, login_id, profile_id, student_phone, parent_phone")
    .eq("id", studentId)
    .maybeSingle();
  if (!s) return { error: "학생을 찾을 수 없어요." };
  if (s.profile_id) return { error: "이미 계정이 있어요. 비밀번호 초기화를 쓰세요." };

  const loginId =
    (wantId || "").trim().toLowerCase() || s.login_id || pickId(s, await usedIds(supabase));
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

/**
 * 계정이 없는 재원생 전부에게 한 번에 만들어 준다.
 *
 * 한 명씩 만들면 스무 명이면 스무 번이다. 다만 **한 명이 실패해도
 * 나머지는 계속 만든다** — 하나 때문에 전부 멈추면 어디까지 됐는지
 * 알 수 없다. 끝나고 누가 됐고 누가 왜 안 됐는지 그대로 돌려준다.
 *
 * 이미 계정이 있는 학생은 건드리지 않는다 (비밀번호도 안 바꾼다).
 */
export async function createAllStudentLogins() {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error, made: [], failed: [] };

  const key = await serviceKey(supabase);
  if (!key) return { ...keyMissing(), made: [], failed: [] };

  const { data: rows, error } = await supabase
    .from("students")
    .select("id, name, login_id, profile_id, student_phone, parent_phone")
    .eq("status", "enrolled")
    .order("name", { ascending: true });
  if (error) {
    if (error.code === "42703") return { error: "0045 SQL 을 먼저 실행해주세요.", made: [], failed: [] };
    return { error: error.message, made: [], failed: [] };
  }

  const todo = (rows || []).filter((s) => !s.profile_id);
  if (todo.length === 0) {
    return { error: null, made: [], failed: [], already: (rows || []).length };
  }

  // 쓰고 있는 아이디를 미리 모아둔다 — 만들 때마다 다시 세면 겹칠 수 있다
  const used = new Set(
    (rows || []).map((x) => (x.login_id || "").toLowerCase()).filter(Boolean)
  );

  const made = [];
  const failed = [];

  for (const s of todo) {
    const loginId = (s.login_id || "").toLowerCase() || pickId(s, used);

    const res = await admin(key, "/users", "POST", {
      email: emailOf(loginId),
      password: INIT_PW,
      email_confirm: true,
      user_metadata: { name: s.name, login_id: loginId },
    });
    if (!res.ok) {
      const msg = res.json?.msg || res.json?.message || `HTTP ${res.status}`;
      failed.push({ name: s.name, why: msg });
      continue;
    }
    const uid = res.json?.id;
    if (!uid) {
      failed.push({ name: s.name, why: "id 를 못 받았어요" });
      continue;
    }

    await supabase.from("profiles").upsert(
      { id: uid, name: s.name, role: "student", must_change_pw: true },
      { onConflict: "id" }
    );
    const up = await supabase
      .from("students").update({ login_id: loginId, profile_id: uid }).eq("id", s.id);
    if (up.error) {
      failed.push({ name: s.name, why: up.error.message });
      continue;
    }
    made.push({ name: s.name, loginId });
  }

  revalidatePath("/students");
  return { error: null, made, failed, password: INIT_PW };
}

/**
 * 학생을 새로 넣을 때 계정도 같이 만든다.
 *
 * 등록해 놓고 계정 만드는 걸 나중에 하면, 그 나중이 안 온다.
 * 다만 **여기서 실패해도 등록 자체는 살아 있어야 한다** — 계정은 나중에
 * 재원생 화면에서 다시 만들면 되지만, 등록이 통째로 날아가면 곤란하다.
 * 그래서 조용히 실패하고 결과만 돌려준다 (키가 없으면 아무 일도 안 한다).
 *
 * 선생님인지 **여기서도 본다.** 이건 등록 화면에서만 불리는 함수지만,
 * 서버 동작은 주소를 아는 사람이 직접 부를 수 있다. 그리고 이 함수는
 * service_role 열쇠로 계정을 만든다 — 남이 부르면 남의 계정을 초기
 * 비밀번호로 만들어 버릴 수 있다. 부르는 쪽을 믿으면 안 된다.
 */
export async function autoCreateLogins(studentIds = []) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return { made: 0 };
  const supabase = createClient();

  const guard = await requirePrincipal(supabase);
  if (guard.error) return { made: 0, skipped: guard.error };

  const key = await serviceKey(supabase);
  if (!key) return { made: 0, skipped: "키 없음" };

  const { data: rows } = await supabase
    .from("students")
    .select("id, name, login_id, profile_id, student_phone, parent_phone")
    .in("id", studentIds);
  const todo = (rows || []).filter((s) => !s.profile_id);
  if (todo.length === 0) return { made: 0 };

  const used = await usedIds(supabase);
  let made = 0;

  for (const s of todo) {
    const loginId = (s.login_id || "").toLowerCase() || pickId(s, used);
    used.add(loginId);

    const res = await admin(key, "/users", "POST", {
      email: emailOf(loginId),
      password: INIT_PW,
      email_confirm: true,
      user_metadata: { name: s.name, login_id: loginId },
    });
    if (!res.ok || !res.json?.id) continue;

    await supabase.from("profiles").upsert(
      { id: res.json.id, name: s.name, role: "student", must_change_pw: true },
      { onConflict: "id" }
    );
    await supabase
      .from("students")
      .update({ login_id: loginId, profile_id: res.json.id })
      .eq("id", s.id);
    made += 1;
  }

  revalidatePath("/students");
  return { made };
}

/** 지금 상태 — 아이디가 있나, 계정이 붙어 있나 */
export async function accountStatus(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = createClient();

  // 아이디·전화번호가 함께 나오므로 선생님만 본다 (표의 잠금이 이미 막지만 한 번 더)
  const guard = await requirePrincipal(supabase);
  if (guard.error) return guard;

  const { data: s, error } = await supabase
    .from("students")
    .select("login_id, profile_id, student_phone, parent_phone")
    .eq("id", studentId)
    .maybeSingle();
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
    suggest: s?.login_id || pickId(s || {}, await usedIds(supabase)),
  };
}

/**
 * **학부모 계정을 한 번에 만든다.**
 *
 * 원장님과 정한 것 (2026-08-05)
 *   아이디 = **어머니 전화번호 그대로** (01012345678). lib/studentId 의 규칙 그대로.
 *   · 학생은 chloe 로 시작하고 이것은 숫자뿐이라 절대 안 겹친다.
 *   · 설명이 필요 없다 — 「아이디는 어머니 전화번호예요」 로 끝난다.
 *     chloe 를 앞에 붙이면 「010 은 빼고」 를 매번 설명해야 한다.
 *   · **어머니 한 분에 계정 하나.** 형제자매가 있어도 번호가 같으니 저절로
 *     하나로 묶이고, 한 번 로그인해서 두 아이를 다 보신다.
 *
 * 비밀번호·첫 로그인 비번 바꾸기는 **학생과 똑같다** (0000 · must_change_pw).
 * 규칙을 둘로 두면 「학부모는 어떻게 하더라」 를 매번 다시 떠올려야 한다.
 */
export async function createAllParentLogins() {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error, made: [], failed: [] };

  const key = await serviceKey(supabase);
  if (!key) return { ...keyMissing(), made: [], failed: [] };

  const { data: rows, error } = await supabase
    .from("students")
    .select("id, name, parent_phone, status")
    .eq("status", "enrolled")
    .order("name", { ascending: true });
  if (error) return { error: error.message, made: [], failed: [] };

  // **번호로 묶는다.** 형제자매면 한 계정이다 (어머니가 두 번 로그인하실 일 없게)
  const byPhone = new Map();
  const noPhone = [];
  (rows || []).forEach((s) => {
    const id = parentLoginId(s.parent_phone);
    if (!id) { noPhone.push(s.name); return; }
    if (!byPhone.has(id)) byPhone.set(id, { loginId: id, phone: s.parent_phone, kids: [] });
    byPhone.get(id).kids.push(s);
  });
  if (byPhone.size === 0) {
    return { error: null, made: [], failed: [], noPhone, password: INIT_PW };
  }

  // 이미 있는 학부모 계정 — 다시 만들지 않는다
  const wanted = [...byPhone.keys()];
  const { data: haveProf } = await supabase
    .from("profiles")
    .select("id, login_id")
    .in("login_id", wanted);
  const have = new Map((haveProf || []).map((p) => [p.login_id, p.id]));

  const made = [];
  const failed = [];
  const already = [];

  for (const g of byPhone.values()) {
    let uid = have.get(g.loginId) || null;

    if (!uid) {
      const label = g.kids.map((k) => k.name).join("·");
      const res = await admin(key, "/users", "POST", {
        email: emailOf(g.loginId),
        password: INIT_PW,
        email_confirm: true,
        user_metadata: { name: `${label} 학부모`, login_id: g.loginId },
      });
      if (!res.ok) {
        failed.push({
          name: g.kids.map((k) => k.name).join(", "),
          why: res.json?.msg || res.json?.message || `HTTP ${res.status}`,
        });
        continue;
      }
      uid = res.json?.id || res.json?.user?.id;
      if (!uid) { failed.push({ name: g.kids[0].name, why: "계정 id 를 못 받았어요." }); continue; }

      const { error: pErr } = await supabase.from("profiles").upsert(
        { id: uid, name: `${label} 학부모`, role: "parent", must_change_pw: true, login_id: g.loginId },
        { onConflict: "id" }
      );
      if (pErr) { failed.push({ name: g.kids[0].name, why: pErr.message }); continue; }
      made.push({ name: label, loginId: g.loginId, kids: g.kids.length });
    } else {
      already.push(g.loginId);
    }

    // **아이와 이어준다.** 계정이 이미 있어도 새로 들어온 동생은 이어줘야 한다
    const links = g.kids.map((k) => ({ parent_profile_id: uid, student_id: k.id }));
    const { error: lErr } = await supabase
      .from("parent_student")
      .upsert(links, { onConflict: "parent_profile_id,student_id" });
    if (lErr) failed.push({ name: g.kids[0].name, why: `연결 실패: ${lErr.message}` });
  }

  return { error: null, made, failed, already, noPhone, password: INIT_PW };
}
