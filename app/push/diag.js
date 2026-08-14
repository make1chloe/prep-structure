"use server";

import { createClient } from "@/lib/supabase/server";
import { inQuiet, nowMinsSeoul, DEFAULT_QUIET } from "@/lib/quiet";
// 이 화면은 「선생님인가」 를 boolean 으로 들고 다닌다 — 이름이 겹쳐 딴 이름으로 불러온다
import { isStaff as isStaffRole } from "@/lib/roles";
import { sessionUser } from "@/lib/session";

/**
 * **알림이 안 올 때, 어디서 막혔는지 그 자리에서 읽는다.**
 *
 * 원장님 (2026-08-07)
 *   「1. 학생이 부르는 중 눌러도 알림이 안 와」
 *   「2. 안드로이드폰에서 알림이 안 켜져」
 *
 * ── 왜 매번 같은 자리로 돌아오나 ──────────────────────────
 *
 * 알림 한 통이 폰에 뜨기까지 지나는 문이 일곱 개다. 그런데 **어느 문에서
 * 막혀도 화면은 똑같다** — 아무 일도 안 일어난다. 읽기 규칙(RLS)은 막을 때
 * 오류를 내지 않고 「없다」 고 답하고, 보내는 쪽은 그것을 「보낼 곳이
 * 없구나」 로 읽고 조용히 넘어간다.
 *
 * 그래서 「안 와요」 만 남고, 저는 추측으로 고치고, 다음 주에 또 같은 말을
 * 듣는다. 이 파일은 그 추측을 없애기 위한 것이다 — **막힌 문 하나를
 * 이름으로 말한다.**
 *
 * 브라우저 쪽에서만 알 수 있는 것(폰 종류 · 허용 여부 · 구독 유무)은
 * components/PushDiag.jsx 가 맡는다. 여기서는 **서버·DB 쪽**만 본다.
 */

/** 한 줄 만들기 */
function line(label, state, detail, fix) {
  return { label, state, detail: detail || "", fix: fix || "" };
}

/** 이 SQL 파일이 돌았나 — 표식 함수를 불러본다 */
async function ran(supabase, rpc) {
  const { error } = await supabase.rpc(rpc);
  return !error;
}

export async function pushDiag() {
  const supabase = createClient();
  const user = await sessionUser(supabase);
  if (!user) return { role: null, steps: [line("로그인", "bad", "로그인이 안 되어 있습니다.")] };

  const { data: profile } = await supabase
    .from("profiles").select("role, name").eq("id", user.id).maybeSingle();
  const role = profile?.role || "unknown";
  const isStaff = isStaffRole(role);

  const steps = [];
  const ROLE_LABEL = {
    principal: "원장", instructor: "강사", assistant: "조교",
    parent: "학부모", student: "학생",
  };
  steps.push(line("지금 누구로 보고 있나", "ok",
    `${profile?.name || "이름 없음"} · ${ROLE_LABEL[role] || role}`));

  // ── 1. 열쇠 ────────────────────────────────────────────
  // 0111 이 있으면 **있다/없다**를 누구나 물어볼 수 있다. 없으면
  // 원장님만 알 수 있어서, 학생 화면에서는 여기를 건너뛴다
  const has0111 = await ran(supabase, "self_push_on");
  if (has0111) {
    const { data: ready } = await supabase.rpc("push_keys_ready");
    steps.push(ready
      ? line("알림 열쇠", "ok", "만들어져 있습니다.")
      : line("알림 열쇠", "bad", "아직 안 만들었습니다.",
             "원장님 화면에서 설정 → 연동 · 키 → 앱 알림 을 한 번 여세요."));
  } else {
    steps.push(line("알림 열쇠", "warn", "확인하려면 0111 SQL 이 필요합니다.",
                    "설정 → 관리자 → Supabase SQL 에서 0111 을 실행해주세요."));
  }

  // ── 2. 공개키를 이 사람이 읽을 수 있나 (0110) ──────────
  // 못 읽으면 **알림 켜기 단추 자체가 실패한다** — 안드로이드에서 「안
  // 켜져」 로 보이는 가장 흔한 이유가 이것이다
  const pk = await supabase.rpc("push_public_key");
  if (pk.error) {
    steps.push(line("알림 켜기 (공개키 읽기)", "bad", "0110 SQL 이 아직 안 돌았습니다.",
                    "설정 → 관리자 → Supabase SQL 에서 0110 을 실행해주세요. 이것이 없으면 학생·학부모는 알림을 켤 수 없습니다."));
  } else if (!pk.data) {
    steps.push(line("알림 켜기 (공개키 읽기)", "bad", "열쇠가 비어 있습니다.",
                    "원장님 화면에서 설정 → 연동 · 키 → 앱 알림 을 한 번 여세요."));
  } else {
    steps.push(line("알림 켜기 (공개키 읽기)", "ok", "읽힙니다."));
  }

  // ── 3. 내 기기가 등록돼 있나 ───────────────────────────
  const { data: mine } = await supabase
    .from("push_subscriptions").select("id, ua, created_at").eq("profile_id", user.id);
  const n = mine?.length || 0;
  steps.push(n > 0
    ? line("내 기기", "ok", `${n}대 등록됨.`)
    : line("내 기기", "bad", "이 계정으로 알림을 켠 기기가 없습니다.",
           "이 화면의 [알림 켜기] 를 눌러주세요. 폰·컴퓨터마다 따로 켜야 합니다."));

  // ── 4. 학생이 부르면 갈 곳이 있나 (0104) ───────────────
  // 원장님 1번 물음이 바로 여기다. 학생 계정으로 이 화면을 열면
  // **학생이 부를 때 실제로 갈 곳**의 수가 그대로 나온다
  const has0104 = await ran(supabase, "staff_push_on");
  if (!has0104) {
    steps.push(line("부르면 선생님 폰으로", "bad", "0104 SQL 이 아직 안 돌았습니다.",
                    "설정 → 관리자 → Supabase SQL 에서 0104 를 실행해주세요. 이것이 없으면 학생이 불러도 선생님 폰은 안 울립니다."));
  } else {
    const { data: t, error: tErr } = await supabase.rpc("staff_push_targets");
    const cnt = Array.isArray(t) ? t.length : 0;
    if (tErr) {
      steps.push(line("부르면 선생님 폰으로", "bad", tErr.message));
    } else if (cnt === 0) {
      steps.push(line("부르면 선생님 폰으로", "bad", "갈 곳이 0대입니다.",
                      isStaff
                        ? "선생님 폰에서 알림을 켜주세요 (홈 화면 앱으로 열어서)."
                        : "선생님께 「원장 앱에서 알림 켜기」 를 말씀해주세요."));
    } else {
      steps.push(line("부르면 선생님 폰으로", "ok", `${cnt}대로 갑니다.`));
    }
  }

  // ── 5. 방해금지 시간에 걸려 있나 (0105) ────────────────
  // 켜져 있고 갈 곳도 있는데 안 오는 마지막 이유. 기본값이 밤 시간이라
  // **아무것도 안 정한 분도** 밤에는 안 온다 — 이걸 모르면 고장으로 읽는다
  const { data: pref, error: prefErr } = await supabase
    .from("push_prefs").select("quiet_from, quiet_to").eq("profile_id", user.id).maybeSingle();
  if (prefErr) {
    steps.push(line("방해금지 시간", "warn", "0105 SQL 전이라 늘 받습니다."));
  } else {
    const from = (pref?.quiet_from || DEFAULT_QUIET.from).slice(0, 5);
    const to = (pref?.quiet_to || DEFAULT_QUIET.to).slice(0, 5);
    const now = inQuiet(nowMinsSeoul(), from, to);
    steps.push(now
      ? line("방해금지 시간", "bad", `지금은 ${from}~${to} 안입니다 — 알림이 눌립니다.`,
             "이 화면의 방해금지 시간을 비우고 저장하면 바로 받습니다.")
      : line("방해금지 시간", "ok", `${from}~${to} · 지금은 걸리지 않습니다.`));
    // 선생님께 가는 알림은 이 규칙을 안 탄다 — 그 말을 안 적으면
    // 원장님이 「내가 방해금지라 학생 부름을 못 받나」 로 오해하신다
    if (isStaff && now) {
      steps[steps.length - 1].fix =
        "선생님께 가는 알림(학생 부름 · 결석 요청)은 방해금지를 타지 않습니다. 그대로 옵니다.";
      steps[steps.length - 1].state = "warn";
    }
  }

  return { role, steps };
}
