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

async function keysOf(supabase) {
  const { data } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "push")
    .maybeSingle();
  return data?.config || null;
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
  return { error: res.error, sent: res.sent };
}
