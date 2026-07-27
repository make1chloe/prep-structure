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
export async function sendSolapi(cfg, list) {
  const { apiKey, apiSecret, sender, pfId } = cfg || {};
  if (!apiKey || !apiSecret || !sender) {
    return list.map((m) => ({ ref: m.ref, ok: false, detail: "발송 설정이 비어 있어요." }));
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
