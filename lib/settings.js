// 연동 설정 읽기 — 서버에서만 쓴다. 비밀값은 화면으로 내려보내지 않는다.

export const DEFAULT_SETTINGS = {
  mode: "copy", // copy | sms | webhook
  academy: { name: "클로이영어" },
  solapi: { apiKey: "", apiSecret: "", sender: "", pfId: "" },
  message: { greeting: "", closing: "", phone: "", address: "" },
  webhook: { url: "", secret: "" },
  // 보강·특강만 하는 요일은 정규 회차에서 뺀다 (2026 점검에서 금요일이 그랬다)
  schedule: { makeupDays: ["금"] },
  // 경고 규칙 — 지각/숙제/단어시험이 경고감인지, 몇 회면 반성문인지
  warning: {
    reflectionAt: 3,
    wordWrongPct: 10,
    countLate: true,
    countHomework: true,
    countWordTest: true,
  },
};

// "금,토" 또는 ["금"] 을 배열로
export function toDays(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  return (v || "")
    .toString()
    .split(/[,\s·]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 문자 종류별 인삿말·맺음말.
 * 앱이 본문을 만드는 문자(데일리리포트·숙제·하원 안내)만 여기서 읽는다.
 * 없으면 데일리리포트 것을 쓰고, 그것도 없으면 빈 값이다.
 */
export async function loadMessageParts(supabase, base = {}) {
  const { data, error } = await supabase
    .from("message_templates")
    .select("key, greeting, closing")
    .not("key", "is", null);
  const byKey = new Map((error ? [] : data || []).map((r) => [r.key, r]));
  const pick = (k) => {
    const r = byKey.get(k) || {};
    return {
      ...base,
      greeting: r.greeting ?? (k === "report" ? base.greeting : "") ?? "",
      closing: r.closing ?? (k === "report" ? base.closing : "") ?? "",
    };
  };
  return {
    report: pick("report"),
    homework: pick("homework"),
    late: pick("late"),
    monthly: pick("monthly"),
  };
}

export async function loadSettings(supabase) {
  const { data, error } = await supabase.from("integrations").select("id, enabled, config");
  if (error) return { ...DEFAULT_SETTINGS, available: false };

  const byId = new Map((data || []).map((r) => [r.id, r]));
  const academy = byId.get("academy")?.config || {};
  const message = byId.get("message")?.config || {};
  const solapi = byId.get("solapi");
  const webhook = byId.get("webhook");
  const schedule = byId.get("schedule")?.config || {};
  const warning = byId.get("warning")?.config || {};

  // 켜져 있는 것을 발송 방식으로 본다 (문자 우선)
  let mode = "copy";
  if (solapi?.enabled) mode = "sms";
  else if (webhook?.enabled) mode = "webhook";

  return {
    available: true,
    mode,
    academy: { name: academy.name || "클로이영어" },
    message: {
      greeting: message.greeting || "",
      closing: message.closing || "",
      phone: message.phone || "",
      address: message.address || "",
    },
    solapi: {
      apiKey: solapi?.config?.apiKey || "",
      apiSecret: solapi?.config?.apiSecret || "",
      sender: solapi?.config?.sender || "",
      pfId: solapi?.config?.pfId || "",     // 알림톡 발신프로필
      enabled: !!solapi?.enabled,
    },
    webhook: {
      url: webhook?.config?.url || "",
      secret: webhook?.config?.secret || "",
      enabled: !!webhook?.enabled,
    },
    schedule: {
      // 저장한 적이 없으면 기본값(금요일)을 쓴다
      makeupDays:
        schedule.makeupDays === undefined
          ? DEFAULT_SETTINGS.schedule.makeupDays
          : toDays(schedule.makeupDays),
    },
    warning: { ...DEFAULT_SETTINGS.warning, ...warning },
  };
}

// 화면에 보여줄 때는 비밀값을 가린다
export function maskSecret(v) {
  const s = (v || "").toString();
  if (!s) return "";
  if (s.length <= 6) return "••••";
  return `${s.slice(0, 4)}••••••${s.slice(-4)}`;
}
