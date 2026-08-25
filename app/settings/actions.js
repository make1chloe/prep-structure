"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { sendSolapi, sendWebhook, normalizePhone, checkSolapi } from "@/lib/send";
import { requirePrincipal } from "@/lib/guard";

function ok(error) {
  return { error: error ? error.message : null };
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
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const { data: prev } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", id)
    .maybeSingle();

  const nextConfig = replace ? config || {} : merge(prev?.config || {}, config || {});

  // ── API Key 와 Secret 은 **짝이다** ─────────────────────────
  //
  // 비밀값은 비워두면 그대로 두는 것이 규칙이다 (가려진 값을 실수로 지우지 않으려고).
  // 그런데 솔라피 키를 새로 발급받아 **Key 만** 바꿔 넣으면, 옛 Secret 이 그대로
  // 남아서 **짝이 어긋난다.** 그러면 저장은 되는데 발송할 때마다
  // 「생성한 signature 를 확인하세요」 가 뜬다 — 왜 그런지 알 길이 없다.
  //
  // 그래서 Key 가 바뀌면 Secret 도 같이 받는다.
  if (id === "solapi") {
    const oldKey = (prev?.config?.apiKey || "").trim();
    const newKey = (config?.apiKey || "").toString().trim();
    const newSecret = (config?.apiSecret || "").toString().trim();

    // **이메일은 절대 API Key 가 아니다.**
    //
    // 옆 칸이 비밀번호 칸이라 크롬이 이 화면을 로그인 폼으로 보고 저장해둔
    // 이메일을 API Key 칸에 채워 넣는다. 그대로 저장되면 멀쩡히 되던 발송이
    // 갑자기 「회원 ID가 유효하지 않습니다」 로 죽는다. 화면에서도 막고
    // 여기서도 막는다 — 자동완성은 사람이 안 눌러도 값을 넣기 때문이다.
    if (newKey.includes("@")) {
      return {
        error:
          "API Key 칸에 이메일이 들어왔어요. 저장하지 않았습니다.\n" +
          "브라우저가 자동으로 채워 넣은 것일 수 있습니다 — 칸을 비우고 " +
          "솔라피 → 개발/연동 → API Key 관리 의 값을 붙여넣어주세요.",
      };
    }

    // 옛 값이 이미 이메일이면(예전에 잘못 저장된 것) 지금 고치시는 중이다.
    // 그때까지 Secret 을 요구해 막으면 되돌릴 방법이 없다.
    const oldLooksReal = oldKey && !oldKey.includes("@");
    if (newKey && oldLooksReal && newKey !== oldKey && !newSecret) {
      return {
        error:
          "API Key 를 새로 넣으셨는데 API Secret 이 비어 있어요.\n" +
          "둘은 짝이라, Key 만 바꾸면 발송할 때 「서명이 맞지 않다」 는 오류가 납니다.\n" +
          "솔라피에서 받은 Secret 도 같이 넣어주세요.",
      };
    }
  }

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

/**
 * 솔라피 연결 점검 — 한 통도 안 보내고 무엇이 막혔는지 알아본다.
 * 「저장이 안 된다」 가 앱 문제인지 솔라피 쪽 문제인지 갈라준다.
 */
export async function checkSolapiNow() {
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };
  const settings = await loadSettings(supabase);
  const res = await checkSolapi(settings.solapi);
  return { error: null, ...res };
}

// 저장된 키를 지운다
export async function clearIntegration(id) {
  const supabase = await createClient();
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
  const supabase = await createClient();
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
