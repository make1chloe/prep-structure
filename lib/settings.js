// 연동 설정 읽기 — 서버에서만 쓴다. 비밀값은 화면으로 내려보내지 않는다.

export const DEFAULT_SETTINGS = {
  mode: "copy", // copy | sms | webhook
  academy: { name: "클로이영어" },
  solapi: { apiKey: "", apiSecret: "", sender: "" },
  webhook: { url: "", secret: "" },
};

export async function loadSettings(supabase) {
  const { data, error } = await supabase.from("integrations").select("id, enabled, config");
  if (error) return { ...DEFAULT_SETTINGS, available: false };

  const byId = new Map((data || []).map((r) => [r.id, r]));
  const academy = byId.get("academy")?.config || {};
  const solapi = byId.get("solapi");
  const webhook = byId.get("webhook");

  // 켜져 있는 것을 발송 방식으로 본다 (문자 우선)
  let mode = "copy";
  if (solapi?.enabled) mode = "sms";
  else if (webhook?.enabled) mode = "webhook";

  return {
    available: true,
    mode,
    academy: { name: academy.name || "클로이영어" },
    solapi: {
      apiKey: solapi?.config?.apiKey || "",
      apiSecret: solapi?.config?.apiSecret || "",
      sender: solapi?.config?.sender || "",
      enabled: !!solapi?.enabled,
    },
    webhook: {
      url: webhook?.config?.url || "",
      secret: webhook?.config?.secret || "",
      enabled: !!webhook?.enabled,
    },
  };
}

// 화면에 보여줄 때는 비밀값을 가린다
export function maskSecret(v) {
  const s = (v || "").toString();
  if (!s) return "";
  if (s.length <= 6) return "••••";
  return `${s.slice(0, 4)}••••••${s.slice(-4)}`;
}
