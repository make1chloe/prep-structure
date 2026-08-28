"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePrincipal } from "@/lib/guard";
import { makeStaffPw, emailOf, serviceKey, admin, keyMissing } from "@/lib/authAdmin";

/**
 * **선생님(강사 · 조교) 계정을 웹앱에서 만든다.**
 *
 * 원장님이 개발자에게 줄 계정이 필요해서 물으셨다 — 「웹앱에서는 못 만들어?」
 * 실측 결과 **못 만들었다.** 학생 계정(accountActions)과 학부모 계정
 * (parentActions)은 있는데, 선생님 계정을 만드는 길도 역할을 주는 화면도
 * 앱 어디에도 없었다. Supabase 대시보드에 들어가서 계정을 만들고, SQL Editor
 * 에서 `update profiles set role='instructor'` 를 치는 것이 유일한 길이었다.
 * 계정 하나 주려고 원장님이 SQL 을 치시게 하면 안 된다.
 *
 * ── 원장만이다 (두 겹) ────────────────────────────────────
 *
 *   ① 화면    이 카드는 `/settings` 안에 있고, 그 화면은 이미
 *             `lib/menu.js` 의 `only: "principal"` + `PrincipalOnly` 다.
 *   ② 서버    아래 모든 동작이 `requirePrincipal` 로 **다시** 묻는다.
 *
 * ②가 없으면 ①은 예의일 뿐이다 — 서버 동작은 주소가 아니라서 미들웨어를
 * 안 지나고, 부르는 쪽을 믿으면 조교가 자기 손으로 강사 계정을 만든다.
 *
 * ── 역할 자물쇠(0175 · 0176)와 부딪히지 않는다 ────────────
 *
 * `public.lock_role()` 은 profiles 의 INSERT · UPDATE · DELETE 를 다 잡고,
 * 스태프 3종을 심거나 올리는 것을 막는다. 다만 **맨 처음에 원장이면 그냥
 * 보내준다**(`is_principal()`). 여기 있는 동작은 전부 원장 세션에서 도는
 * 것이라 그 문으로 통과한다 — 자물쇠를 건드릴 필요가 없다.
 * (진짜 Postgres 에서 확인한다: `scripts/check-roles.sh` 의 「원장은 강사
 *  계정을 만들 수 있습니다」 · 「원장은 강사↔조교를 바꿉니다」)
 *
 * ── 원장으로 올리는 길은 여기 없다 ────────────────────────
 *
 * `principal` 은 아래 어디에서도 받지 않는다. 자물쇠가 막는 것이기도 하지만,
 * 그보다 **원장이 둘이 되면 서로를 끌 수 있다.** 원장을 늘려야 할 일이
 * 생기면 그때 Supabase SQL Editor 에서 한 줄로 한다 — 일 년에 없을 일이다.
 *
 * ── 지우기는 안 만든다 (판정) ─────────────────────────────
 *
 * 계정을 지우면 `auth.users` 삭제 → `profiles` 로 cascade 인데, profiles 를
 * 가리키는 외래키가 **스물다섯 군데**다 (상담일지 `created_by` · 성적
 * `created_by` · 할일 `assignee_id` · 리포트 댓글 `author_id` …). 대부분
 * `on delete set null` 이라 **그 선생님이 쓴 기록의 작성자가 통째로 빈다.**
 * `report_reads`(0180) · `push_subscriptions`(0016) 는 아예 같이 지워진다.
 * 그만둔 선생님 계정을 막자고 지난 학기 기록의 작성자를 지울 이유가 없다.
 *
 * 그래서 **끄기(정지)** 만 만든다 — Supabase 인증이 이미 가진 `ban_duration`
 * 을 쓴다. 로그인 자체가 막히고(화면 가리기가 아니라 인증 단계다), 되돌릴
 * 수 있고, 새 칸도 새 표도 안 만든다. 정말로 지워야 하면 Supabase 대시보드
 * 에서 지운다 — 그 길은 이미 열려 있다(0176 이 비상구로 남겨둔 자리다).
 */

/** 여기서 줄 수 있는 역할은 둘뿐이다. principal 은 없다 */
const ROLE_LABEL = { instructor: "강사", assistant: "조교" };
const STAFF_ROLES = Object.keys(ROLE_LABEL);

/** 끄면 이만큼 잠근다 (100년). GoTrue 는 기간으로만 받는다 — 「영원히」 가 없다 */
const BAN_FOREVER = "876000h";

function badRole(role) {
  return STAFF_ROLES.includes(role)
    ? null
    : "역할은 강사 또는 조교만 정할 수 있어요. (원장은 여기서 못 만듭니다)";
}

/**
 * 이 계정이 정말 강사·조교인가 — **손대기 전에 늘 묻는다.**
 * id 를 밖에서 받으므로, 이걸 빼먹으면 원장 계정이나 학생 계정의 비밀번호를
 * 이 화면에서 초기화할 수 있게 된다.
 */
async function staffRow(supabase, id) {
  if (!id) return { error: "누구인지 못 받았어요." };
  const { data, error } = await supabase
    .from("profiles").select("id, name, role, login_id").eq("id", id).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "그 계정을 찾을 수 없어요." };
  if (!STAFF_ROLES.includes(data.role)) {
    return { error: "강사·조교 계정만 여기서 다룰 수 있어요." };
  }
  return { error: null, row: data };
}

/**
 * 지금 있는 선생님 계정들.
 *
 * 보여주는 것은 **profiles 가 이미 들고 있는 것**뿐이다 — 이름 · 아이디 ·
 * 역할 · 만든 날. 「마지막 로그인」 은 profiles 에 없다(auth 쪽에만 있다).
 * 그거 하나 보자고 계정마다 왕복을 하나 더 붙이지 않는다.
 *
 * 딱 하나 밖에서 물어오는 것이 **꺼져 있나**다. 이건 안 물어보면 화면이
 * 거짓말을 한다 — 끈 계정이 켜진 것처럼 보이면 끄기 버튼이 무의미해진다.
 * 강사·조교는 한두 명이라 그 왕복은 한두 번이고, 아무도 없으면 0 번이다.
 */
export async function listStaffAccounts() {
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error, rows: [], hasKey: false };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, login_id, created_at")
    .in("role", STAFF_ROLES)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message, rows: [], hasKey: false };

  const key = await serviceKey(supabase);
  const rows = data || [];
  if (!key) {
    // 열쇠가 없으면 「꺼졌나」 를 알 길이 없다. **모른다고 말한다** — 켜진
    // 것처럼 그려두면 원장님이 막았다고 믿고 계신 계정이 실은 열려 있다
    return { error: null, hasKey: false, rows: rows.map((r) => ({ ...r, off: null })) };
  }

  const out = [];
  for (const r of rows) {
    const got = await admin(key, `/users/${r.id}`, "GET");
    const until = got.ok ? got.json?.banned_until : undefined;
    out.push({ ...r, off: got.ok ? !!(until && new Date(until) > new Date()) : null });
  }
  return { error: null, hasKey: true, rows: out };
}

/**
 * 계정을 만든다.
 *
 * **비밀번호는 사람이 안 정한다.** 앱이 만들어서 한 번 보여주고 끝이다
 * (`makeStaffPw` — 왜 학생의 0000 과 다른지는 lib/authAdmin 에 적어뒀다).
 * 다시 보려면 초기화다. 로그에도 화면 기록에도 남기지 않는다.
 */
export async function createStaffLogin(name, wantId, role) {
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const who = (name || "").trim();
  if (!who) return { error: "이름을 적어주세요." };
  const bad = badRole(role);
  if (bad) return { error: bad };

  const loginId = (wantId || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{4,30}$/.test(loginId)) {
    return { error: "아이디는 영문 소문자·숫자로 4~30자여야 해요." };
  }

  const key = await serviceKey(supabase);
  if (!key) return keyMissing("선생님 계정");

  const pw = makeStaffPw();
  const made = await admin(key, "/users", "POST", {
    email: emailOf(loginId),
    password: pw,
    email_confirm: true,
    user_metadata: { name: who, login_id: loginId },
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
   * 여기서 역할을 심는다. 트리거(`on_auth_user_created`)가 이미 role
   * 'student' 로 profiles 를 만들어 뒀을 수 있으므로 upsert 다.
   *
   * **반쯤 만들어진 계정을 남기지 않는다.** 이 줄이 실패하면 로그인은 되는데
   * 역할이 'student' 인 계정이 남는다 — 학생 화면에서 「연결 코드를 넣으세요」
   * 를 만나게 되고, 원장님은 목록에서 그 계정을 보지도 못한다(강사·조교만
   * 세니까). 그래서 되돌린다.
   */
  const { error: pErr } = await supabase.from("profiles").upsert(
    { id: uid, name: who, role, login_id: loginId, must_change_pw: false },
    { onConflict: "id" }
  );
  if (pErr) {
    await admin(key, `/users/${uid}`, "DELETE");
    // 자물쇠(0176)에 막힌 것이면 그렇다고 말해준다 — 「알 수 없는 오류」 보다 낫다
    const hint = /원장만/.test(pErr.message)
      ? " (역할 자물쇠 0176 이 막았습니다 — 원장 계정으로 로그인했는지 확인해주세요)"
      : "";
    return { error: `역할을 주지 못해서 계정을 되돌렸어요: ${pErr.message}${hint}` };
  }

  revalidatePath("/settings");
  return { error: null, name: who, loginId, role, password: pw };
}

/** 강사 ↔ 조교. 원장으로 올리는 길은 없다 */
export async function setStaffRole(id, role) {
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const bad = badRole(role);
  if (bad) return { error: bad };

  const found = await staffRow(supabase, id);
  if (found.error) return { error: found.error };
  if (found.row.role === role) return { error: null, role };

  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { error: null, role };
}

/** 비밀번호를 새로 만든다. 한 번 보여주고 끝 — 다시 보려면 또 초기화다 */
export async function resetStaffPassword(id) {
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const found = await staffRow(supabase, id);
  if (found.error) return { error: found.error };

  const key = await serviceKey(supabase);
  if (!key) return keyMissing("선생님 계정");

  const pw = makeStaffPw();
  const res = await admin(key, `/users/${id}`, "PUT", { password: pw });
  if (!res.ok) {
    const msg = res.json?.msg || res.json?.message || `HTTP ${res.status}`;
    return { error: `비밀번호를 바꾸지 못했어요: ${msg}` };
  }

  revalidatePath("/settings");
  return { error: null, name: found.row.name, loginId: found.row.login_id, password: pw };
}

/**
 * 끄기 · 켜기 — 그만둔 선생님이 못 들어오게 한다.
 *
 * 인증 단계에서 막는다(`ban_duration`). 화면을 가리는 것이 아니라 **로그인
 * 자체가 안 된다** — 남아 있는 쿠키로도, 주소를 알아도 못 들어온다.
 */
export async function setStaffActive(id, active) {
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const found = await staffRow(supabase, id);
  if (found.error) return { error: found.error };

  const key = await serviceKey(supabase);
  if (!key) return keyMissing("선생님 계정");

  const res = await admin(key, `/users/${id}`, "PUT", {
    ban_duration: active ? "none" : BAN_FOREVER,
  });
  if (!res.ok) {
    const msg = res.json?.msg || res.json?.message || `HTTP ${res.status}`;
    return { error: `${active ? "켜지" : "끄지"} 못했어요: ${msg}` };
  }

  revalidatePath("/settings");
  return { error: null, off: !active };
}
