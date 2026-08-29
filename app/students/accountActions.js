"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parentLoginId } from "@/lib/studentId";
import { baseLoginId, resolveLoginId } from "@/lib/studentId";
import { requireTeacher, requireStaff } from "@/lib/guard";
import { makePw, emailOf, serviceKey, admin, keyMissing } from "@/lib/authAdmin";

/**
 * 학생 계정을 원장님이 직접 만들어 준다.
 *
 * 아이들은 이메일 주소도 비밀번호도 잊어버린다. 그래서 학원이 아이디를 준다.
 *   아이디  chloe0001  (재원생 목록에서 뽑는다)
 *   비번    0000 — 처음 들어오면 **반드시** 자기 것으로 바꾼다
 * 또 잊으면 원장님이 새로 만들어 준다.
 *
 * Supabase 로그인은 이메일만 받으므로 아이디에 도메인을 붙여 속으로만
 * 이메일을 만든다. 학생은 그런 게 있는지도 모른다.
 *
 * 계정을 만들려면 service_role 키가 필요하다. 이 키는 **설정 화면에서
 * 직접 넣어** integrations 에 담기고, 서버에서만 읽는다.
 * 화면에도 대화에도 나오지 않는다.
 */

/**
 * 도메인 · 첫 비밀번호 · 열쇠 읽기 · Admin API 호출은 **lib/authAdmin 하나**다.
 * 선생님 계정을 만드는 자리(app/settings/staffActions.js)가 생기면서 같은
 * 다섯을 두 벌로 적을 뻔했다 — 도메인이 한쪽만 바뀌면 그 계정들은 영영 못
 * 들어온다 (원칙 1). 하는 일은 안 바뀌었다. 왜 0000 인지도 거기 적어뒀다.
 */

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
 * 이미 아이디가 있으면 그대로 두고 비밀번호만 새로 만든다.
 */
export async function createStudentLogin(studentId, wantId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const guard = await requireTeacher(supabase);
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

  const pw = makePw();
  const made = await admin(key, "/users", "POST", {
    email: emailOf(loginId),
    password: pw,
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
  return { error: null, loginId, password: pw };
}

/**
 * **이름을 바꾸면 로그인 계정의 이름도 따라간다** (감사 ⑥-12, 2026-08-29).
 *
 * 이름이 두 곳에 있다 — 재원생의 이름(students.name)과 로그인 계정의
 * 이름(profiles.name). 계정을 만들 때 한 번 복사해 넣고 그것으로 끝이었다.
 * 그래서 재원생 화면에서 이름을 고쳐도 아이·학부모가 로그인하면 **옛 이름**이
 * 보였다 (학생 화면 인사말 · 학부모 화면 · 리포트 댓글 작성자 · 알림 확인).
 *
 * 학부모 계정 이름은 「○○○ 학부모」 다. **옛 이름으로 지어진 것일 때만**
 * 고친다 — 형제가 있는 집은 다른 아이 이름으로 지어져 있을 수 있고,
 * 그것까지 덮으면 엉뚱한 집 이름이 된다.
 *
 * 이름 맞추기는 **덤**이다 — 실패해도 이름 저장 자체는 그대로 둔다.
 */
export async function syncAccountName(studentId, newName, oldName) {
  const name = (newName || "").trim();
  if (!studentId || !name || name === (oldName || "").trim()) return { error: null };
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  try {
    const { data: s } = await supabase
      .from("students").select("profile_id").eq("id", studentId).maybeSingle();
    if (s?.profile_id) {
      await supabase.from("profiles").update({ name }).eq("id", s.profile_id);
    }

    // 학부모 계정 — 「옛이름 학부모」 로 지어져 있을 때만
    const was = (oldName || "").trim();
    if (was) {
      const { data: link } = await supabase
        .from("parent_student").select("parent_profile_id").eq("student_id", studentId);
      const pids = (link || []).map((x) => x.parent_profile_id).filter(Boolean);
      if (pids.length) {
        await supabase
          .from("profiles").update({ name: `${name} 학부모` })
          .in("id", pids).eq("name", `${was} 학부모`);
      }
    }
  } catch { /* 이름 맞추기는 덤 — 저장이 먼저다 */ }

  revalidatePath("/students");
  return { error: null };
}

/**
 * **아이디를 바꾼다 — 표의 글자와 진짜 계정을 같이.**
 *
 * 로그인 아이디는 두 곳에 있다: 재원생 표의 `students.login_id` (원장님이
 * 보는 글자)와 진짜 계정의 이메일 `아이디@도메인` (아이가 들어올 때 쓰는
 * 것). 예전에는 표만 고쳐졌다 — 원장님 화면에는 새 아이디가 보이는데
 * **그 아이디로는 못 들어왔다.** 원칙 1(같은 값 두 벌 금지)이 깨진 자리다.
 *
 * 그래서 아이디를 고치는 길은 이 함수 **한 곳**이다. updateStudent 도
 * login_id 가 오면 여기로 넘긴다 — 표에서 고치든 한 판에서 고치든 같다.
 *
 * 계정이 아직 없는 학생(profile_id 가 빈 학생)은 바꿀 계정이 없으니
 * 글자만 고친다 — 나중에 계정을 만들 때 그 글자로 만들어진다.
 */
export async function renameStudentLogin(studentId, wantId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return guard;

  const next = (wantId || "").trim().toLowerCase();

  const { data: s } = await supabase
    .from("students")
    .select("id, name, login_id, profile_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!s) return { error: "학생을 찾을 수 없어요." };

  const now = (s.login_id || "").trim().toLowerCase();
  if (next === now) return { error: null, loginId: s.login_id };

  // 비우기 — 계정이 있는데 아이디만 지우면 그 아이는 영영 못 들어온다
  if (!next) {
    if (s.profile_id) {
      return { error: "계정이 있는 학생은 아이디를 비울 수 없어요. 계정 칸에서 지워주세요." };
    }
    const { error } = await supabase
      .from("students").update({ login_id: null }).eq("id", studentId);
    revalidatePath("/students");
    return { error: error ? error.message : null };
  }

  if (!/^[a-z0-9._-]{4,30}$/.test(next)) {
    return { error: "아이디는 영문·숫자로 4~30자여야 해요." };
  }
  // 학원 안에서 겹치면 안 된다 (소문자 기준). 계정 쪽도 이메일이 겹쳐 실패한다
  const taken = await usedIds(supabase);
  if (taken.has(next)) {
    return { error: `이미 쓰고 있는 아이디예요 (${next}). 다른 아이디로 해주세요.` };
  }

  // 계정이 없으면 바꿀 계정도 없다 — 글자만
  if (!s.profile_id) {
    const { error } = await supabase
      .from("students").update({ login_id: next }).eq("id", studentId);
    revalidatePath("/students");
    return { error: error ? error.message : null, loginId: next };
  }

  const key = await serviceKey(supabase);
  if (!key) return keyMissing();

  // **계정을 먼저 바꾼다.** 계정이 실패했는데 표만 바뀌면 원장님은 바뀐 줄
  // 아는데 아이는 못 들어온다 — 그 순서로는 안 된다.
  const res = await admin(key, `/users/${s.profile_id}`, "PUT", {
    email: emailOf(next),
    email_confirm: true,
    user_metadata: { name: s.name, login_id: next },
  });
  if (!res.ok) {
    const msg = res.json?.msg || res.json?.message || `HTTP ${res.status}`;
    if (/already|registered|exists/i.test(msg)) {
      return { error: `이미 쓰고 있는 아이디예요 (${next}). 다른 아이디로 해주세요.` };
    }
    return { error: `아이디를 바꾸지 못했어요: ${msg}` };
  }

  const { error } = await supabase
    .from("students").update({ login_id: next }).eq("id", studentId);
  if (error) {
    // 계정은 바뀌었는데 표가 안 바뀌었다 — 계정을 되돌려 둘을 맞춘다
    await admin(key, `/users/${s.profile_id}`, "PUT", {
      email: emailOf(now || next),
      email_confirm: true,
      user_metadata: { name: s.name, login_id: now || next },
    });
    return { error: error.message };
  }

  revalidatePath("/students");
  return { error: null, loginId: next };
}

/** 비밀번호를 새로 만든다 (아이가 잊었을 때). 다시 0000 이 되고, 들어오면 바로 바꾼다 */
export async function resetStudentPassword(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return guard;

  const key = await serviceKey(supabase);
  if (!key) return keyMissing();

  const { data: s } = await supabase
    .from("students").select("profile_id, login_id").eq("id", studentId).maybeSingle();
  if (!s?.profile_id) return { error: "아직 계정이 없어요." };

  const pw = makePw();
  const res = await admin(key, `/users/${s.profile_id}`, "PUT", { password: pw });
  if (!res.ok) {
    const msg = res.json?.msg || res.json?.message || `HTTP ${res.status}`;
    return { error: `비밀번호를 바꾸지 못했어요: ${msg}` };
  }

  // 다음에 들어오면 바로 바꾸게 한다
  await supabase.from("profiles").update({ must_change_pw: true }).eq("id", s.profile_id);

  revalidatePath("/students");
  return { error: null, loginId: s.login_id, password: pw };
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
  const supabase = await createClient();
  const guard = await requireTeacher(supabase);
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

    const pw = makePw();
    const res = await admin(key, "/users", "POST", {
      email: emailOf(loginId),
      password: pw,
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
    made.push({ name: s.name, loginId, password: pw });
  }

  revalidatePath("/students");
  return { error: null, made, failed };
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
  const supabase = await createClient();

  const guard = await requireTeacher(supabase);
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

    const pw = makePw();
    const res = await admin(key, "/users", "POST", {
      email: emailOf(loginId),
      password: pw,
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
  const supabase = await createClient();

  // 아이디·전화번호가 함께 나오므로 선생님만 본다 (표의 잠금이 이미 막지만 한 번 더)
  const guard = await requireTeacher(supabase);
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
 *   · **형제로 묶어두신 아이들만 한 계정이다** (0071 의 family_id).
 *     번호가 같다는 이유로 묶지 않는다 — 번호를 잘못 적은 것, 사촌, 한 분이
 *     남의 아이까지 등록해주신 것이 전부 형제가 되어버렸다. 형제가 되면
 *     **한 계정으로 남의 아이 성적·상담이 다 보인다** (원장님, 2026-08-06).
 *
 * 비밀번호·첫 로그인 비번 바꾸기는 **학생과 똑같다** (0000 · must_change_pw).
 * 규칙을 둘로 두면 「학부모는 어떻게 하더라」 를 매번 다시 떠올려야 한다.
 * 어머니께 드릴 말씀도 한 줄로 끝난다 — 「아이디는 어머니 번호, 비번은 0000,
 * 들어가시면 바꾸라고 나옵니다」.
 */
export async function createAllParentLogins() {
  const supabase = await createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return { error: guard.error, made: [], failed: [] };

  const key = await serviceKey(supabase);
  if (!key) return { ...keyMissing(), made: [], failed: [] };

  let { data: rows, error } = await supabase
    .from("students")
    .select("id, name, parent_phone, status, family_id")
    .eq("status", "enrolled")
    .order("name", { ascending: true });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0071 전이면 형제 묶기 칸이 없다 — 그때는 아무도 형제가 아니다
    ({ data: rows, error } = await supabase
      .from("students")
      .select("id, name, parent_phone, status")
      .eq("status", "enrolled")
      .order("name", { ascending: true }));
  }
  if (error) return { error: error.message, made: [], failed: [] };

  /**
   * **형제로 묶어두신 것만 한 계정이다** (원장님, 2026-08-06).
   *
   *   「형제 아닌 애들이 형제 처리되어 있어. 애초에 대시보드에서 형제로
   *    묶지 않으면 형제 인식 안 되게 해줘」
   *
   * 전에는 **전화번호가 같으면 형제**로 봤다. 어머니 번호로 아이디를 만드니
   * 자연스러워 보였지만 틀렸다 — 번호를 잘못 적은 것, 사촌, 한 분이 남의
   * 아이까지 등록해주신 것이 전부 형제가 됐다. 그리고 형제가 되면 **한
   * 계정으로 남의 아이 성적·상담이 다 보인다.** 짐작으로 열어주면 안 된다.
   *
   * 이제 묶는 기준은 `family_id`(0071) 하나뿐이다. 안 묶으셨으면 남남이다.
   */
  const groups = new Map();          // 묶음키 → { kids }
  const noPhone = [];
  (rows || []).forEach((s) => {
    if (!parentLoginId(s.parent_phone)) { noPhone.push(s.name); return; }
    const key = s.family_id ? `fam:${s.family_id}` : `one:${s.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });

  /**
   * 아이디는 어머니 번호다. 그래서 **형제로 안 묶였는데 번호가 같으면**
   * 아이디가 겹친다. 그때는 앞엣것만 만들고 **나머지는 알려드린다** —
   * 조용히 합쳐버리면 우리가 방금 고친 그 문제로 되돌아간다.
   */
  const byPhone = new Map();
  const clash = [];
  [...groups.values()].forEach((kids) => {
    const id = parentLoginId(kids[0].parent_phone);
    if (byPhone.has(id)) {
      clash.push({
        name: kids.map((k) => k.name).join(", "),
        why: `${byPhone.get(id).kids.map((k) => k.name).join(", ")} 와 번호가 같은데 형제로 안 묶여 있어요. ` +
             "형제면 재원생 목록에서 묶어주시고, 아니면 번호를 확인해주세요.",
      });
      return;
    }
    byPhone.set(id, { loginId: id, phone: kids[0].parent_phone, kids });
  });
  if (byPhone.size === 0) {
    return { error: null, made: [], failed: clash, noPhone };
  }

  // 이미 있는 학부모 계정 — 다시 만들지 않는다
  const wanted = [...byPhone.keys()];
  const { data: haveProf } = await supabase
    .from("profiles")
    .select("id, login_id")
    .in("login_id", wanted);
  const have = new Map((haveProf || []).map((p) => [p.login_id, p.id]));

  const made = [];
  const failed = [...clash];
  const already = [];

  for (const g of byPhone.values()) {
    let uid = have.get(g.loginId) || null;

    if (!uid) {
      const label = g.kids.map((k) => k.name).join("·");
      const pw = makePw();
      const res = await admin(key, "/users", "POST", {
        email: emailOf(g.loginId),
        password: pw,
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
      made.push({ name: label, loginId: g.loginId, kids: g.kids.length, password: pw });
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

  return { error: null, made, failed, already, noPhone };
}
