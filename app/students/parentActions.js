"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/guard";
import { INIT_PW, emailOf, serviceKey, admin, keyMissing as keyMissingFor } from "@/lib/authAdmin";

const keyMissing = () => keyMissingFor("학부모 계정");

/**
 * 학부모 계정.
 *
 * 학생 계정과 **같은 방식**이다 — 학원이 아이디를 주고, 비번은 0000 으로
 * 시작해서 처음 들어오면 바꾸게 한다. 학부모님은 이메일을 만들 필요가 없다.
 *
 * 다만 학생 계정과 다른 것이 하나 있다. **형제자매는 계정 하나로 둘 다 본다.**
 * 형제를 묶어두신 이유가 그것이다 (0071). 그래서
 *   · 계정을 만들 때 형제 전부를 한 번에 연결하고
 *   · 형제 중 누구에게 이미 학부모 계정이 있으면 **새로 만들지 않고 거기에 붙인다**
 *
 * 안 그러면 아이가 둘인 집은 로그인을 두 번 해야 하고, 원장님은 같은 학부모에게
 * 아이디를 두 개 알려드려야 한다.
 */

/**
 * 도메인 · 0000 · 열쇠 읽기 · Admin API 호출은 **lib/authAdmin 하나**다
 * (원칙 1). 여기에도 같은 다섯이 따로 적혀 있었고, 그중 「열쇠를 어디에
 * 넣나」 안내는 **옛 화면 이름**(「Supabase · AI 키」)을 가리키고 있었다 —
 * 그 상자는 이제 「학생 계정 키」다. 두 벌로 적으면 이렇게 한쪽만 늙는다.
 */

/** 이 아이와 **한 집인 아이들** — 형제로 묶여 있으면 전부 (0071) */
async function familyOf(supabase, studentId) {
  const { data: me } = await supabase
    .from("students")
    .select("id, name, family_id, login_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!me) return { me: null, siblings: [] };
  if (!me.family_id) return { me, siblings: [me] };
  const { data: fam } = await supabase
    .from("students")
    .select("id, name, family_id, login_id")
    .eq("family_id", me.family_id);
  return { me, siblings: (fam || []).length ? fam : [me] };
}

/** 지금 이 아이의 학부모 계정은 어떤 상태인가 */
export async function parentStatus(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return { error: guard.error };

  const { me, siblings } = await familyOf(supabase, studentId);
  if (!me) return { error: "학생을 찾을 수 없어요." };

  const ids = siblings.map((s) => s.id);
  const { data: links } = await supabase
    .from("parent_student")
    .select("parent_profile_id, student_id")
    .in("student_id", ids);

  const mine = (links || []).filter((l) => l.student_id === studentId);
  const anyLink = (links || [])[0] || null;

  let profile = null;
  const pid = mine[0]?.parent_profile_id || anyLink?.parent_profile_id || null;
  if (pid) {
    const { data } = await supabase
      .from("profiles").select("id, name, login_id, must_change_pw").eq("id", pid).maybeSingle();
    profile = data || null;
  }

  // 이 학부모 계정이 지금 보고 있는 아이들
  const childIds = new Set(
    (links || []).filter((l) => l.parent_profile_id === pid).map((l) => l.student_id)
  );

  return {
    error: null,
    hasKey: !!(await serviceKey(supabase)),
    linked: mine.length > 0,
    // 형제에게만 계정이 있는 경우 — 새로 만들지 말고 여기 붙이면 된다
    siblingOnly: mine.length === 0 && !!pid,
    loginId: profile?.login_id || "",
    mustChange: !!profile?.must_change_pw,
    children: siblings.filter((s) => childIds.has(s.id)).map((s) => s.name),
    siblings: siblings.map((s) => ({ id: s.id, name: s.name })),
    suggest: `${(me.login_id || "chloe").toLowerCase()}p`,
  };
}

/**
 * 학부모 계정을 만든다 — 형제가 있으면 **전부 한 계정에** 연결한다.
 * 형제 중에 이미 학부모 계정이 있으면 **새로 만들지 않고** 거기에 이 아이를 붙인다.
 */
export async function createParentLogin(studentId, wantId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return guard;

  const { me, siblings } = await familyOf(supabase, studentId);
  if (!me) return { error: "학생을 찾을 수 없어요." };
  const ids = siblings.map((s) => s.id);

  // 이미 있는 계정 — 형제 것이라도 그것을 쓴다
  const { data: links } = await supabase
    .from("parent_student").select("parent_profile_id, student_id").in("student_id", ids);
  const existing = (links || [])[0]?.parent_profile_id || null;

  if (existing) {
    const rows = ids.map((student_id) => ({ parent_profile_id: existing, student_id }));
    const { error } = await supabase
      .from("parent_student").upsert(rows, { onConflict: "parent_profile_id,student_id" });
    if (error) return { error: error.message };
    const { data: p } = await supabase
      .from("profiles").select("login_id").eq("id", existing).maybeSingle();
    revalidatePath("/students");
    return {
      error: null,
      loginId: p?.login_id || "",
      password: null,          // 비번은 이미 정하신 것이 있다
      joined: true,
      count: ids.length,
    };
  }

  const key = await serviceKey(supabase);
  if (!key) return keyMissing();

  const loginId = (wantId || "").trim().toLowerCase() || `${(me.login_id || "chloe").toLowerCase()}p`;
  if (!/^[a-z0-9._-]{4,30}$/.test(loginId)) {
    return { error: "아이디는 영문·숫자로 4~30자여야 해요." };
  }

  const made = await admin(key, "/users", "POST", {
    email: emailOf(loginId),
    password: INIT_PW,
    email_confirm: true,
    user_metadata: { name: `${me.name} 학부모`, login_id: loginId },
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

  /**
   * **역할을 못 박는 것이 이 줄의 본론이다** (2026-08-07).
   *
   * 계정을 만들면 방아쇠(on_auth_user_created)가 profiles 를 먼저 만든다 —
   * 그때 역할은 **기본값(학생)** 이다. 여기서 'parent' 로 덮어야 학부모
   * 화면으로 간다. 이 한 줄이 실패하면 계정은 멀쩡히 만들어지고, 어머니는
   * 로그인해서 **학생 화면을 보시게 된다.**
   *
   * 그런데 결과를 안 보고 넘어가고 있었다. 실패하는 길이 실제로 있다 —
   * 부르신 분의 역할이 어긋나 있으면 `is_staff()` 가 거짓이라 남의
   * profiles 를 못 고친다. 그러면 **아무 말 없이** 학생으로 남는다.
   */
  const { error: roleErr } = await supabase.from("profiles").upsert(
    { id: uid, name: `${me.name} 학부모`, role: "parent", login_id: loginId, must_change_pw: true },
    { onConflict: "id" }
  );
  if (roleErr) {
    return {
      error:
        `계정은 만들었는데 학부모로 표시하지 못했어요 (${roleErr.message}). ` +
        "이대로 두면 로그인하셔도 학생 화면이 나옵니다. 원장님 계정의 역할부터 확인해주세요.",
    };
  }
  const { error } = await supabase
    .from("parent_student")
    .upsert(ids.map((student_id) => ({ parent_profile_id: uid, student_id })), {
      onConflict: "parent_profile_id,student_id",
    });
  if (error) return { error: error.message };

  revalidatePath("/students");
  return { error: null, loginId, password: INIT_PW, count: ids.length };
}

/** 비밀번호를 0000 으로 되돌린다 (학부모님이 잊었을 때) */
export async function resetParentPassword(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return guard;

  const key = await serviceKey(supabase);
  if (!key) return keyMissing();

  const { data: link } = await supabase
    .from("parent_student").select("parent_profile_id").eq("student_id", studentId).maybeSingle();
  if (!link) return { error: "아직 학부모 계정이 없어요." };

  const res = await admin(key, `/users/${link.parent_profile_id}`, "PUT", { password: INIT_PW });
  if (!res.ok) {
    const msg = res.json?.msg || res.json?.message || `HTTP ${res.status}`;
    return { error: `비밀번호를 바꾸지 못했어요: ${msg}` };
  }
  await supabase
    .from("profiles").update({ must_change_pw: true }).eq("id", link.parent_profile_id);

  const { data: p } = await supabase
    .from("profiles").select("login_id").eq("id", link.parent_profile_id).maybeSingle();
  revalidatePath("/students");
  return { error: null, loginId: p?.login_id || "", password: INIT_PW };
}

/**
 * 이 아이만 학부모 계정에서 뗀다.
 *
 * 계정 자체는 안 지운다 — 형제가 아직 붙어 있을 수 있고, 지우면 되돌릴 수 없다.
 */
export async function unlinkParent(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return guard;
  const { error } = await supabase
    .from("parent_student").delete().eq("student_id", studentId);
  revalidatePath("/students");
  return { error: error ? error.message : null };
}
