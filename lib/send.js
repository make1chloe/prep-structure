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
    // 발송 실패도 **고칠 수 있는 말**로 남긴다. 대시보드의 「안 나간 문자」에
    // 그대로 뜨는 글자라, 솔라피 말을 그대로 흘리면 거기서도 막힌다.
    const msg = sayWhy(body, res.status);
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
 * 솔라피가 하는 말을 **고칠 수 있는 말**로 옮긴다.
 *
 * 「회원 ID가 유효하지 않습니다」 만 보고는 어디를 손대야 하는지 알 수 없다.
 * 실제로 이 말이 뜨는 이유는 대개 API Key 칸에 로그인 이메일을 넣은 것이다.
 */
export function sayWhy(body, status) {
  const raw = body?.errorMessage || body?.message || "";
  const code = body?.errorCode || "";
  const has = (s) => raw.includes(s);

  // **IP 제한.** Key·Secret 은 맞는데 막힌 것이라, "키를 확인하세요" 라고
  // 하면 멀쩡한 키를 붙들고 헤매게 된다. 이건 솔라피 쪽 설정 문제다.
  //
  // 그리고 이 앱은 **고정 IP 가 없다** (버셀은 요청마다 IP 가 바뀐다).
  // 그러니 지금 뜬 IP 를 허용 목록에 넣어도 다음에 또 막힌다 —
  // 그 말을 안 해주면 넣었다 막혔다를 반복하게 된다.
  const ip = (raw.match(/(\d{1,3}(?:\.\d{1,3}){3})/) || [])[1];
  if (code === "InvalidIpAddress" || has("허용되지 않은 IP") || (has("IP") && ip)) {
    return (
      "API Key 는 맞습니다. 솔라피 계정에 「IP 접근 제한」이 켜져 있어서 막힌 거예요" +
      (ip ? ` (지금 ${ip} 에서 나갑니다)` : "") +
      ". 이 앱은 IP 가 고정이 아니라 요청마다 바뀝니다 — 지금 IP 를 넣어두셔도 다음에 또 막혀요. " +
      "솔라피 → 설정 → 보안 에서 IP 접근 제한을 꺼주세요."
    );
  }
  if (code === "InvalidApiKey" || has("회원 ID") || has("유효하지 않은 API")) {
    return "API Key 가 맞지 않아요. 솔라피 → 개발/연동 → API Key 관리 에서 발급받은 값인지 봐주세요 (로그인 이메일이 아닙니다).";
  }
  if (code === "InvalidSignature" || has("서명") || has("signature")) {
    return "API Secret 이 맞지 않아요. Key 를 새로 발급하면 Secret 도 새로 나옵니다 — 한 쌍으로 넣어주세요.";
  }
  if (status === 401 || status === 403) {
    return `이 계정으로는 안 됩니다 (${raw || `HTTP ${status}`}). Key·Secret 을 다시 확인해주세요.`;
  }
  return raw || `HTTP ${status}`;
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

  // **제일 흔한 잘못** — 로그인 이메일을 API Key 칸에 넣는 것.
  //   솔라피는 이때 「회원 ID가 유효하지 않습니다」 라고 답하는데, 그 말만
  //   보면 무엇을 고쳐야 하는지 알 수가 없다. 부르기 전에 여기서 잡는다.
  const looksLikeEmail = /@/.test(apiKey || "");
  const missing = missingSolapi(cfg);
  add("keys", "API Key · Secret",
    looksLikeEmail ? false : (!!apiKey && !!apiSecret),
    looksLikeEmail
      ? "이메일이 들어 있어요. 로그인 아이디가 아니라 솔라피 → 개발/연동 → API Key 관리 에서 발급받은 API Key 를 넣어주세요."
      : (!apiKey || !apiSecret)
        ? `${missing.filter((m) => m !== "발신번호").join(" · ")}이(가) 비었어요.`
        : "저장됨");
  if (looksLikeEmail) {
    add("sender", "발신번호 (앱에 저장)", !!sender, sender ? normalizePhone(sender) : "비었어요.");
    return { ok: false, steps };
  }
  add("sender", "발신번호 (앱에 저장)", !!sender,
    sender ? normalizePhone(sender) : "설정 → 발송 방식에서 적고 저장해주세요.");

  if (!apiKey || !apiSecret) return { ok: false, steps };

  // 솔라피에 등록된 발신번호를 물어본다
  let numbers = null;
  try {
    const res = await fetch(`${SOLAPI}/senderid/v1/numbers`, {
      headers: { Authorization: hmacHeader({ apiKey, apiSecret }) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // **로그인 문제와 물어보는 방법 문제를 갈라야 한다.**
      //   전에 우리가 솔라피가 안 받는 파라미터를 붙여 보내놓고
      //   「솔라피 로그인 안 됨」 이라고 띄운 적이 있다. 그러면 멀쩡한 키를
      //   붙들고 헤매게 된다 — 우리 잘못을 원장님 잘못처럼 보이게 한 것이다.
      const mine = res.status === 400 || /사용할 수 없습니다|파라미터|parameter/i.test(
        body?.errorMessage || body?.message || ""
      );
      add("auth", mine ? "발신번호 목록 물어보기" : "솔라피 로그인", false,
        mine
          ? `앱이 잘못 물어봤어요 (${body?.errorMessage || body?.message || `HTTP ${res.status}`}). ` +
            "이건 원장님이 고칠 것이 아니라 제가 고칠 부분입니다 — 알려주세요."
          : sayWhy(body, res.status));
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
      const res = await fetch(`${SOLAPI}/kakao/v2/channels`, {
        headers: { Authorization: hmacHeader({ apiKey, apiSecret }) },
      });
      const body = await res.json().catch(() => null);
      const raw = body?.channelList ?? body?.data ?? body;
      const ids = (Array.isArray(raw) ? raw : Object.values(raw || {}))
        .map((c) => c?.pfId || c?.channelId)
        .filter(Boolean);
      if (!res.ok) {
        // 채널 목록을 못 읽었다고 pfId 가 틀린 것은 아니다
        add("kakao", "알림톡 발신프로필", null,
          `확인은 못 했지만 저장은 돼 있어요 (${body?.errorMessage || `HTTP ${res.status}`}).`);
      } else {
        const has = ids.includes(pfId);
        add("kakao", "알림톡 발신프로필", has,
          has ? "연결됨" : ids.length
            ? `이 계정의 발신프로필은 ${ids.join(" · ")} 입니다.`
            : "연결된 카카오 채널이 없어요.");
      }
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
