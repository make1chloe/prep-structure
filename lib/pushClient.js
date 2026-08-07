/**
 * **브라우저 쪽 알림 켜기** — 한 군데에만 둔다.
 *
 * 켜는 절차가 화면마다 흩어져 있으면, 한 곳만 고치고 다른 곳은 옛날 그대로가
 * 된다. 실제로 「알림 받기」 칸과 「알림을 켜야 볼 수 있어요」 문이 같은 일을
 * 하므로, 그 일은 여기 하나로 둔다.
 *
 * ── 기기마다 되는 곳이 다르다 (2026-08-07) ────────────────
 *
 * 원장님 — 「근데 이게 Windows 에서도 가능한 건지 모르겠네?」
 *
 *   윈도우 · 안드로이드   크롬·엣지·파이어폭스 **탭에서 그냥 된다.**
 *                          홈 화면에 담을 필요가 없다.
 *   아이폰 · 아이패드      **홈 화면에 담아야만** 된다. 사파리 탭에서는
 *                          아예 안 된다 (애플이 그렇게 만들었다).
 *   맥                     크롬·엣지는 탭에서 되고, 사파리는 「독에 추가」 해야 한다.
 *
 * 그래서 안내를 기기별로 다르게 해야 한다. 「홈 화면에 추가하세요」 를
 * 윈도우에서 보여주면 학생은 할 수가 없고, 그러면 그 자리에서 막힌다.
 */

export function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** 지금 이 기기가 무엇인가 */
export function deviceKind() {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  // 아이패드는 최근 것부터 자기를 맥이라고 말한다 — 손가락이 닿는지로 가른다
  const iPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPod/.test(ua) || iPad) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh/.test(ua)) return "mac";
  return "unknown";
}

/** 홈 화면(또는 독)에 담아서 연 것인가 */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator?.standalone === true
  );
}

/**
 * 이 기기에서 알림을 켜려면 무엇을 해야 하나 — **기기마다 다르다.**
 * @returns { can, steps[], why }
 */
export function howTo() {
  const kind = deviceKind();
  const standalone = isStandalone();

  if (kind === "ios") {
    if (!standalone) {
      return {
        can: false,
        why: "아이폰은 앱을 홈 화면에 담아야 알림을 켤 수 있어요.",
        steps: [
          "사파리 아래쪽 가운데 [공유] 버튼을 누르세요 (네모에 위쪽 화살표).",
          "목록을 내려서 [홈 화면에 추가]를 누르세요.",
          "홈 화면에 생긴 클로이영어 아이콘으로 다시 여세요.",
          "그 화면에서 [알림 켜기]를 누르면 끝납니다.",
        ],
      };
    }
    return { can: true, why: null, steps: ["아래 [알림 켜기]를 누르고, 물어보면 [허용]을 누르세요."] };
  }

  if (kind === "windows" || kind === "android" || kind === "mac" || kind === "unknown") {
    return {
      can: true,
      why: null,
      steps: [
        "아래 [알림 켜기]를 누르세요.",
        "브라우저가 물어보면 [허용]을 누르세요.",
        ...(kind === "mac" && !standalone
          ? ["사파리를 쓰신다면 [공유 → 독에 추가] 한 뒤 그 아이콘으로 열어주세요."]
          : []),
      ],
    };
  }
  return { can: true, why: null, steps: ["아래 [알림 켜기]를 누르세요."] };
}

/**
 * 지금 상태 — "on" · "off" · "denied" · "unsupported"
 *
 * **부르는 쪽이 판단하지 않게** 여기서 한 낱말로 정한다.
 */
export async function pushState() {
  if (typeof window === "undefined") return "checking";
  if (whyUnsupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.getSubscription();
    if (Notification.permission === "denied") return "denied";
    return sub ? "on" : "off";
  } catch (e) {
    lastError = e?.message || String(e);
    return "unsupported";
  }
}

let lastError = null;

/**
 * **왜 못 쓰는지 그대로 말한다** (원장님, 2026-08-07 —
 * 「홈화면에 추가해도 이 브라우저에서는 알림을 쓸수 없다고 나와」).
 *
 * 「쓸 수 없어요」 한 줄로는 아무도 못 고친다. 막힌 데가 여러 곳인데
 * 화면에는 똑같이 나왔다 —
 *
 *   · 아이폰인데 **iOS 16.4 보다 낮다** → 담아도 안 된다. 업데이트뿐이다
 *   · 아이폰인데 **홈 화면에서 연 것이 아니다** → 담아서 그 아이콘으로
 *   · **비공개 브라우징** → 서비스워커 자체가 없다
 *   · https 가 아니다 → 그럴 일은 없지만 확인은 한다
 *
 * @returns null 이면 쓸 수 있다. 아니면 { why, fix }
 */
export function whyUnsupported() {
  if (typeof window === "undefined") return null;

  const hasSW = "serviceWorker" in navigator;
  const hasPush = "PushManager" in window;
  if (hasSW && hasPush) return null;

  const kind = deviceKind();
  const stand = isStandalone();

  if (kind === "ios") {
    if (!stand) {
      return {
        why: "아이폰은 홈 화면에 담아서 연 앱에서만 알림을 켤 수 있어요.",
        fix: "사파리에서 [공유 → 홈 화면에 추가] 한 뒤, 생긴 아이콘으로 다시 열어주세요.",
      };
    }
    /**
     * **담았는데도 안 되면 대개 iOS 가 낮다.** 애플이 웹 알림을 연 것은
     * iOS 16.4 부터다. 16.3 짜리 폰에서는 아무리 담아도 PushManager 가 없다 —
     * 그런데 화면에는 「이 브라우저에서는…」 만 나와서, 담고 또 담게 된다.
     */
    return {
      why: "이 아이폰의 iOS 가 낮아서 알림을 쓸 수 없어요 (iOS 16.4 이상 필요).",
      fix: "설정 → 일반 → 정보 에서 버전을 확인하고, 설정 → 일반 → 소프트웨어 업데이트 를 해주세요.",
    };
  }

  if (!hasSW) {
    return {
      why: "이 브라우저에서는 알림을 쓸 수 없어요. 비공개(시크릿) 창일 수 있어요.",
      fix: "보통 창에서 다시 열어주세요. 크롬 · 엣지 · 파이어폭스에서 됩니다.",
    };
  }
  return {
    why: "이 브라우저가 알림을 지원하지 않아요.",
    fix: "크롬 · 엣지 · 파이어폭스에서 열어주세요.",
  };
}

/** 서비스워커 등록이 터졌을 때 그 말 그대로 (원인을 못 찾을 때 마지막 실마리) */
export function lastPushError() {
  return lastError;
}

/**
 * 켠다. 실패하면 **왜 안 됐는지**를 사람 말로 돌려준다.
 *
 * @param getKey  서버에서 공개키를 받아오는 함수
 * @param save    구독을 서버에 저장하는 함수
 */
export async function enablePush(getKey, save) {
  // 「쓸 수 없어요」 한 줄로는 아무도 못 고친다 — 왜 못 쓰는지·무엇을 하면
  // 되는지까지 (원장님, 2026-08-07)
  const no = whyUnsupported();
  if (no) return { ok: false, error: `${no.why} ${no.fix}` };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return {
      ok: false,
      denied: true,
      error: "알림을 허용하지 않으셨어요. 브라우저 주소창 옆 자물쇠에서 알림을 허용으로 바꿔주세요.",
    };
  }
  const { publicKey, error } = await getKey();
  if (error || !publicKey) {
    return { ok: false, error: error || "알림 준비가 아직 안 됐어요. 선생님께 말씀해주세요." };
  }
  try {
    await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const res = await save(sub.toJSON(), navigator.userAgent);
    if (res?.error) return { ok: false, error: res.error };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: `알림을 켜지 못했어요: ${e.message}` };
  }
}
