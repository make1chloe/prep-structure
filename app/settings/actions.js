"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { sendSolapi, sendWebhook, normalizePhone } from "@/lib/send";

function ok(error) {
  return { error: error ? error.message : null };
}

async function requirePrincipal(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "principal") {
    return { error: "이 설정은 원장 계정에서만 바꿀 수 있어요." };
  }
  return { user };
}

// 값이 비어 있으면 기존 값을 그대로 둔다 (가려진 비밀값을 실수로 지우지 않도록)
function merge(prev = {}, next = {}) {
  const out = { ...prev };
  Object.entries(next).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = v.toString().trim();
    if (s === "") return;
    out[k] = s;
  });
  return out;
}

export async function saveIntegration(id, { enabled, config, replace } = {}) {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const { data: prev } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", id)
    .maybeSingle();

  const nextConfig = replace ? config || {} : merge(prev?.config || {}, config || {});

  const { error } = await supabase.from("integrations").upsert(
    {
      id,
      enabled: !!enabled,
      config: nextConfig,
      updated_at: new Date().toISOString(),
      updated_by: guard.user.id,
    },
    { onConflict: "id" }
  );
  revalidatePath("/settings");
  revalidatePath("/report");
  return ok(error);
}

// 저장된 키를 지운다
export async function clearIntegration(id) {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };
  const { error } = await supabase
    .from("integrations")
    .update({ enabled: false, config: {} })
    .eq("id", id);
  revalidatePath("/settings");
  return ok(error);
}

// 내 번호로 한 통 보내 연결을 확인한다
export async function testSend(to, mode) {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const phone = normalizePhone(to);
  if (!phone) return { error: "받을 번호를 적어주세요." };

  const settings = await loadSettings(supabase);
  const text = `[${settings.academy.name}] 발송 연결 테스트입니다. 이 문자가 도착했다면 설정이 끝났습니다.`;
  const list = [{ to: phone, text, ref: "test" }];

  const res =
    (mode || settings.mode) === "webhook"
      ? await sendWebhook(settings.webhook, list, { kind: "test" })
      : await sendSolapi(settings.solapi, list);

  const r = res[0];
  return { error: r?.ok ? null : r?.detail || "발송 실패", detail: r?.detail || "" };
}
