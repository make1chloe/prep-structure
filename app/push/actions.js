"use server";

import { createClient } from "@/lib/supabase/server";
import { generateKeys, pushToAll } from "@/lib/push";

// 알림 키 — 설정 화면에서 한 번 만들면 계속 쓴다
export async function ensurePushKeys() {
  const supabase = createClient();
  const { data } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "push")
    .maybeSingle();
  if (data?.config?.publicKey) return { publicKey: data.config.publicKey, error: null };

  const keys = generateKeys();
  const { error } = await supabase.from("integrations").upsert(
    { id: "push", enabled: true, config: keys, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) return { publicKey: null, error: error.message };
  return { publicKey: keys.publicKey, error: null };
}

// 화면에서 알림을 켤 때 필요한 공개키
export async function getPushPublicKey() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "push")
    .maybeSingle();
  if (error) return { publicKey: null, error: "0016 SQL을 먼저 실행해주세요." };
  return { publicKey: data?.config?.publicKey || null, error: null };
}

// 기기 등록 / 해제
export async function saveSubscription(sub, ua) {
  if (!sub?.endpoint) return { error: "구독 정보가 없어요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      student_id: student?.id || null,
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh || "",
      auth: sub.keys?.auth || "",
      ua: (ua || "").slice(0, 200),
    },
    { onConflict: "endpoint" }
  );
  return { error: error ? error.message : null };
}

export async function removeSubscription(endpoint) {
  if (!endpoint) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { error: error ? error.message : null };
}

// ---------- 보내기 ----------

/**
 * 보낼 때 쓸 열쇠.
 *
 * `integrations` 는 **원장님만** 읽는다 (0015). 그래서 강사·조교가 리포트를
 * 올리거나 댓글을 다시면 여기가 **빈 값**으로 와서 조용히 안 보내졌다 —
 * 학생 알림이 안 왔던 것과 똑같은 병이다. 0104 의 `push_keys()` 가
 * 표 주인 자격으로 꺼내 준다 (선생님에게만 답한다).
 */
async function keysOf(supabase) {
  const { data } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "push")
    .maybeSingle();
  if (data?.config?.privateKey) return data.config;

  const { data: rows, error } = await supabase.rpc("push_keys");
  if (error || !rows?.length) return data?.config || null;   // 0104 전이면 예전 그대로
  const k = rows[0];
  return { publicKey: k.public_key, privateKey: k.private_key, contact: k.contact };
}

async function subsOf(supabase, studentIds) {
  if (!studentIds?.length) return [];
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("student_id", studentIds);
  return data || [];
}

/** 학생 여러 명에게 알림 */
export async function pushToStudents(studentIds, payload) {
  const supabase = createClient();
  const keys = await keysOf(supabase);
  if (!keys?.privateKey) return { sent: 0, error: null }; // 알림을 안 쓰는 상태면 조용히 넘어간다

  const subs = await subsOf(supabase, studentIds);
  if (subs.length === 0) return { sent: 0, error: null };

  const res = await pushToAll(keys, subs, payload);
  if (res.gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", res.gone);
  }
  return { sent: res.sent, error: res.error };
}

/**
 * **한 집으로 알림** — 아이 폰과 어머니 폰.
 *
 * 원장님 (2026-08-06) — 알림톡으로 알리던 것을 전부 앱 안에서 해결하기로 했다.
 * 알림톡은 어머니 폰으로 갔다. 그러니 앱 알림도 어머니께 닿아야 한다. 아이
 * 폰에만 보내면 「앱에 올렸습니다」 가 어머니께는 안 간 것과 같다.
 *
 * **누구에게 보낼지는 그 글이 누구에게 보이는지로 정한다.**
 *   who="all"     아이도 어머니도 보는 것 (일정 · 전달사항 · 숙제)
 *   who="parent"  어머니만 보는 것 (교재 · 보강 · 늦은 귀가 · 수업/월간 리포트)
 *
 * 보이지도 않는 것을 알리면 안 된다. 아이가 알림을 눌렀는데 아무것도 없으면
 * 그다음부터 알림을 안 누른다 — 정작 자기 숙제 알림까지 같이 죽는다.
 *
 * 알림을 안 켠 기기는 그냥 없는 것이다 — 조용히 넘어간다.
 */
export async function pushToFamilies(studentIds, payload, who = "all") {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0) return { sent: 0, error: null };

  const supabase = createClient();
  const keys = await keysOf(supabase);
  if (!keys?.privateKey) return { sent: 0, error: null };   // 알림을 안 쓰면 조용히

  // 아이 기기
  const { data: mine } = who === "parent"
    ? { data: [] }
    : await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .in("student_id", ids);

  // 그 아이의 학부모 기기 (학부모 계정은 student_id 가 안 붙는다 — profile_id 로 찾는다)
  const { data: links } = await supabase
    .from("parent_student")
    .select("parent_profile_id")
    .in("student_id", ids);
  const parents = [...new Set((links || []).map((l) => l.parent_profile_id).filter(Boolean))];
  const { data: theirs } = parents.length
    ? await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .in("profile_id", parents)
    : { data: [] };

  // 한 기기에 두 번 보내지 않는다 (아이 폰에 어머니가 로그인해 두신 집이 있다)
  const byId = new Map();
  [...(mine || []), ...(theirs || [])].forEach((s) => byId.set(s.id, s));
  const subs = [...byId.values()];
  if (subs.length === 0) return { sent: 0, error: null };

  const res = await pushToAll(keys, subs, payload);
  if (res.gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", res.gone);
  }
  return { sent: res.sent, error: res.error };
}

// 선생님이 직접 보내는 테스트 알림
export async function testPush() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const keys = await keysOf(supabase);
  if (!keys?.privateKey) return { error: "먼저 알림 키를 만들어주세요." };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", user.id);
  if (!subs?.length) return { error: "이 기기에서 먼저 알림 받기를 켜주세요." };

  const res = await pushToAll(keys, subs, {
    title: "클로이영어",
    body: "알림 연결 테스트입니다. 이 알림이 보이면 설정이 끝났어요.",
    url: "/me",
  });
  if (res.error) return { error: res.error, sent: 0 };

  /**
   * **몇 대에 보냈는지 말한다** (2026-08-07).
   *
   * 「보냈어요」 만으로는 폰에 안 왔을 때 어디를 봐야 할지 알 수 없다.
   * 「1대에 보냈어요」 까지 나오면, 그래도 안 뜬 것은 **폰 쪽 설정**이라는
   * 뜻이 된다 (아이폰 설정 → 알림에서 이 앱이 꺼져 있는 경우).
   */
  const gone = res.gone.length ? ` (옛 기기 ${res.gone.length}대는 정리했어요)` : "";
  if (res.gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", res.gone);
  }
  return { error: null, sent: res.sent, note: `${res.sent}대에 보냈어요.${gone}` };
}

/**
 * **선생님 폰(그리고 워치)으로 알림.**
 *
 * 원장님 (2026-08-05) — 「아이 상태가 바뀌면 알림 오게 해줘. 워치랑 연동하게.
 * 숙제는 제외하고 수업 중에만」
 *
 * 워치는 따로 붙이는 것이 없다. 폰에 온 알림을 워치가 그대로 보여준다
 * (아이폰+애플워치, 안드로이드+갤럭시워치 둘 다). 그래서 폰에 알림이 오게
 * 하는 것이 전부다 — **홈 화면에 담아둔 앱**에서 알림 받기를 켜두셔야 한다.
 *
 * **숙제는 안 보낸다.** 집에서 하는 것이라 밤에 알림이 울린다. 수업 중에
 * 등원 학습을 끝냈을 때만 보낸다 (부르는 계산은 부르는 쪽에서 한다).
 */
/**
 * ── 왜 안 왔나 (2026-08-06, 원장님 — 「학생이 도움을 요청해도 알림이 안 와」) ──
 *
 * 코드는 멀쩡했다. 학생이 부르면 이 함수가 불렸다. 그런데 이 함수가
 * **학생의 자격으로** DB 를 읽는다 (서버에서 도는 코드라도 로그인한 사람의
 * 권한으로 읽는다). 그래서 —
 *
 *   · 알림 열쇠(`integrations`) → **원장님만** 읽을 수 있다 (0015)
 *   · 선생님들의 기기(`push_subscriptions`) → 본인 것이나 선생님만 (0016)
 *
 * 둘 다 학생에게는 **빈 값**으로 온다. 오류가 아니라 **없는 것처럼** 온다.
 * 그러면 아래 두 줄이 「알림을 안 쓰시는구나」 하고 조용히 넘어갔다.
 *
 * 이 앱에서 여러 번 겪은 그 모양이다 — 읽기 규칙은 막을 때 오류를 안 내고,
 * 그래서 화면도 로그도 멀쩡해 보인다.
 *
 * 0104 의 `staff_push_targets()` 가 **표 주인 자격으로** 대상을 찾아준다.
 * 0104 를 아직 안 돌리셨으면 예전 길로 돌아간다 (원장님이 부르실 때는 된다).
 */
export async function pushToStaff(payload) {
  const supabase = createClient();

  // 0104 — 학생·학부모가 불러도 대상을 찾을 수 있는 길
  const { data: targets, error: rpcErr } = await supabase.rpc("staff_push_targets");
  if (!rpcErr && Array.isArray(targets)) {
    if (targets.length === 0) return { sent: 0, error: null };   // 아무도 알림을 안 켰다
    const keys = {
      publicKey: targets[0].public_key,
      privateKey: targets[0].private_key,
      contact: targets[0].contact,
    };
    const subs = targets.map((t, i) => ({
      id: `${i}`, endpoint: t.endpoint, p256dh: t.p256dh, auth: t.auth,
    }));
    const res = await pushToAll(keys, subs, payload);
    // 사라진 기기는 여기서 못 지운다 (id 가 없다) — 다음에 선생님이 여실 때 정리된다
    return { sent: res.sent, error: res.error };
  }

  // 0104 전이면 예전 길 (선생님 자격으로 부를 때만 된다)
  const keys = await keysOf(supabase);
  if (!keys?.privateKey) return { sent: 0, error: null };

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, role")
    .in("role", ["principal", "instructor", "assistant"]);
  const ids = (staff || []).map((p) => p.id);
  if (ids.length === 0) return { sent: 0, error: null };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", ids);
  if (!subs?.length) return { sent: 0, error: null };

  const res = await pushToAll(keys, subs, payload);
  if (res.gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", res.gone);
  }
  return { sent: res.sent, error: res.error };
}
