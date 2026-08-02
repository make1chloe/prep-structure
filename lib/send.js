import crypto from "crypto";

// 발송 방식은 설정 화면에서 고른다. 코드를 고치거나 재배포할 일이 없도록.
//   copy    : 보내지 않고 "보냄"으로 기록만 (복사해서 직접 발송)
//   sms     : 솔라피로 직접 발송
//   webhook : 우리가 만든 문구를 외부(Make 등)로 넘기고, 발송은 거기서

const SOLAPI = "https://api.solapi.com";

function hmacHeader({ apiKey, apiSecret }) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 전화번호에서 숫자만 남긴다
export function normalizePhone(v) {
  const d = (v || "").toString().replace(/[^\d]/g, "");
  return d || "";
}

/**
 * 문자 · 알림톡 발송 (솔라피)
 *
 * @param {object} cfg  { apiKey, apiSecret, sender, pfId }
 * @param {Array}  list [{ to, text, ref, kakao? }]
 *                 kakao: { templateId, variables }  — 있으면 알림톡으로 나간다
 * @returns {Array} [{ ref, ok, detail }]
 *
 * 알림톡이 막히면(수신 거부·미가입 등) **문자로 대신 나간다.**
 * 그래서 알림톡을 쓰더라도 text 는 항상 채워서 보낸다.
 */
/**
 * 무엇이 비었는지 **이름을 대준다.**
 *
 * 예전에는 셋 중 무엇이 없어도 「발송 설정이 비어 있어요」 한 줄이었다.
 * 그 줄만 보고는 설정 화면에 가서 무엇을 채워야 하는지 알 수가 없다.
 */
export function missingSolapi(cfg) {
  const { apiKey, apiSecret, sender } = cfg || {};
  const out = [];
  if (!apiKey) out.push("API Key");
  if (!apiSecret) out.push("API Secret");
  if (!sender) out.push("발신번호");
  return out;
}

export async function sendSolapi(cfg, list) {
  const { apiKey, apiSecret, sender, pfId } = cfg || {};
  const missing = missingSolapi(cfg);
  if (missing.length > 0) {
    const detail = `설정 → 발송 방식에서 ${missing.join(" · ")}이(가) 비어 있어요.`;
    return list.map((m) => ({ ref: m.ref, ok: false, detail }));
  }

  const from = normalizePhone(sender);
  const messages = list.map((m) => {
    const long = Buffer.byteLength(m.text || "", "utf8") > 90;
    const base = {
      to: normalizePhone(m.to),
      from,
      text: m.text,
      // 90바이트가 넘으면 장문(LMS)으로 나가야 한다
      type: long ? "LMS" : "SMS",
      subject: long ? "학원 안내" : undefined,
    };
    if (pfId && m.kakao?.templateId) {
      return {
        ...base,
        type: "ATA",                     // 알림톡
        kakaoOptions: {
          pfId,
          templateId: m.kakao.templateId,
          variables: m.kakao.variables || {},
          disableSms: false,             // 안 가면 문자로 대신 보낸다
        },
      };
    }
    return base;
  });

  let res;
  try {
    res = await fetch(`${SOLAPI}/messages/v4/send-many/detail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: hmacHeader({ apiKey, apiSecret }),
      },
      body: JSON.stringify({ messages }),
    });
  } catch (e) {
    return list.map((m) => ({ ref: m.ref, ok: false, detail: `연결 실패: ${e.message}` }));
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg = body?.errorMessage || body?.message || `HTTP ${res.status}`;
    return list.map((m) => ({ ref: m.ref, ok: false, detail: msg }));
  }

  // 실패한 건만 골라낸다 (솔라피는 건별 결과를 돌려준다)
  const failed = new Map();
  (body?.failedMessageList || []).forEach((f) => {
    failed.set(normalizePhone(f.to), f.statusMessage || f.statusCode || "발송 실패");
  });

  return list.map((m) => {
    const to = normalizePhone(m.to);
    const err = failed.get(to);
    return { ref: m.ref, ok: !err, detail: err || "발송 요청됨" };
  });
}

/**
 * 솔라피 연결 점검 — **한 통도 안 보내고** 무엇이 막혀 있는지 알아본다.
 *
 * 「저장이 안 된다」 는 말 뒤에는 대개 두 가지가 섞여 있다.
 *   1) 우리 앱에 안 들어갔다
 *   2) 우리 앱에는 들어갔는데 **솔라피 쪽에 발신번호가 등록이 안 됐다**
 * 둘은 고치는 곳이 다르다 (하나는 설정 화면, 하나는 솔라피 사이트).
 * 그래서 솔라피에게 직접 물어본다 — 등록된 발신번호가 무엇인지.
 *
 * @returns { ok, steps: [{ key, label, ok, detail }] }
 */
export async function checkSolapi(cfg) {
  const { apiKey, apiSecret, sender, pfId } = cfg || {};
  const steps = [];
  const add = (key, label, ok, detail) => steps.push({ key, label, ok, detail });

  const missing = missingSolapi(cfg);
  add("keys", "API Key · Secret", !!apiKey && !!apiSecret,
    !apiKey || !apiSecret ? `${missing.filter((m) => m !== "발신번호").join(" · ")}이(가) 비었어요.` : "저장됨");
  add("sender", "발신번호 (앱에 저장)", !!sender,
    sender ? normalizePhone(sender) : "설정 → 발송 방식에서 적고 저장해주세요.");

  if (!apiKey || !apiSecret) return { ok: false, steps };

  // 솔라피에 등록된 발신번호를 물어본다
  let numbers = null;
  try {
    const res = await fetch(`${SOLAPI}/senderid/v1/numbers?limit=200`, {
      headers: { Authorization: hmacHeader({ apiKey, apiSecret }) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      add("auth", "솔라피 로그인", false,
        body?.errorMessage || `HTTP ${res.status} — Key·Secret 을 다시 확인해주세요.`);
      return { ok: false, steps };
    }
    add("auth", "솔라피 로그인", true, "연결됨");
    // 솔라피는 { numberList: {...} } 또는 배열로 준다 — 둘 다 받는다
    const raw = body?.numberList ?? body?.data ?? body;
    numbers = (Array.isArray(raw) ? raw : Object.values(raw || {}))
      .map((n) => normalizePhone(n?.phoneNumber || n?.number || n))
      .filter(Boolean);
  } catch (e) {
    add("auth", "솔라피 로그인", false, `연결 실패: ${e.message}`);
    return { ok: false, steps };
  }

  if (sender) {
    const want = normalizePhone(sender);
    const has = numbers.includes(want);
    add("registered", "발신번호 (솔라피에 등록)", has,
      has
        ? "등록되어 있어요."
        : numbers.length === 0
          ? "솔라피에 등록된 발신번호가 하나도 없어요. 솔라피 사이트에서 먼저 등록해주세요."
          : `솔라피에는 ${numbers.join(" · ")} 만 등록되어 있어요. 이 중 하나로 적어주세요.`);
  }

  // 알림톡은 발신프로필(pfId)이 있어야 나간다
  if (pfId) {
    try {
      const res = await fetch(`${SOLAPI}/kakao/v2/channels?limit=100`, {
        headers: { Authorization: hmacHeader({ apiKey, apiSecret }) },
      });
      const body = await res.json().catch(() => null);
      const raw = body?.channelList ?? body?.data ?? body;
      const ids = (Array.isArray(raw) ? raw : Object.values(raw || {}))
        .map((c) => c?.pfId || c?.channelId)
        .filter(Boolean);
      const has = ids.includes(pfId);
      add("kakao", "알림톡 발신프로필", has,
        has ? "연결됨" : ids.length
          ? `이 계정의 발신프로필은 ${ids.join(" · ")} 입니다.`
          : "연결된 카카오 채널이 없어요.");
    } catch (e) {
      add("kakao", "알림톡 발신프로필", false, `확인 실패: ${e.message}`);
    }
  } else {
    add("kakao", "알림톡 발신프로필", null, "비어 있어요 — 전부 문자로 나갑니다.");
  }

  return { ok: steps.every((s) => s.ok !== false), steps };
}

/**
 * 웹훅으로 넘기기 — Make 등 기존 자동화를 계속 쓰고 싶을 때
 * @param {object} cfg  { url, secret }
 */
export async function sendWebhook(cfg, list, meta = {}) {
  const { url, secret } = cfg || {};
  if (!url) {
    return list.map((m) => ({ ref: m.ref, ok: false, detail: "웹훅 주소가 비어 있어요." }));
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Webhook-Secret": secret } : {}),
      },
      body: JSON.stringify({ ...meta, messages: list }),
    });
    const ok = res.ok;
    const detail = ok ? "웹훅 전달됨" : `웹훅 실패: HTTP ${res.status}`;
    return list.map((m) => ({ ref: m.ref, ok, detail }));
  } catch (e) {
    return list.map((m) => ({ ref: m.ref, ok: false, detail: `웹훅 연결 실패: ${e.message}` }));
  }
}

// 설정에 따라 실제로 보낸다
export async function deliver(settings, list, meta = {}) {
  const mode = settings?.mode || "copy";
  if (mode === "sms") return { channel: "sms", results: await sendSolapi(settings.solapi, list) };
  if (mode === "webhook")
    return { channel: "webhook", results: await sendWebhook(settings.webhook, list, meta) };
  return {
    channel: "copy",
    results: list.map((m) => ({ ref: m.ref, ok: true, detail: "직접 발송(기록만)" })),
  };
}
