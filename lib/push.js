import webpush from "web-push";

// 웹 푸시 — 문자와 달리 건당 비용이 없다.
// 보내는 데 필요한 키(VAPID)는 설정 화면에서 한 번 만들어 integrations 에 저장한다.

export function generateKeys() {
  return webpush.generateVAPIDKeys(); // { publicKey, privateKey }
}

function configure({ publicKey, privateKey, contact }) {
  webpush.setVapidDetails(contact || "mailto:noreply@example.com", publicKey, privateKey);
}

/** 어느 회사 알림 서버인가 — 애플·구글이 거절하는 까닭이 서로 다르다 */
function whose(endpoint = "") {
  if (/apple/.test(endpoint)) return "아이폰";
  if (/google|fcm/.test(endpoint)) return "안드로이드·크롬";
  if (/mozilla/.test(endpoint)) return "파이어폭스";
  return "알 수 없는 기기";
}

/**
 * 왜 거절당했는지 사람 말로.
 *
 * 숫자만 보여드리면 아무 뜻이 없고, 숫자를 안 보여드리면 제가 못 고친다.
 * 둘 다 적는다.
 */
function reason(code, body) {
  const tail = body ? ` — ${body.slice(0, 120)}` : "";
  if (code === 400) return `알림 키가 이 기기와 안 맞습니다 (400). 기기에서 알림을 껐다 다시 켜주세요${tail}`;
  if (code === 401 || code === 403) return `알림 열쇠가 거절됐습니다 (${code}). 알림 키를 다시 만들고, 기기마다 알림을 다시 켜야 합니다${tail}`;
  if (code === 413) return `내용이 너무 깁니다 (413)${tail}`;
  if (code === 429) return `잠시 뒤에 다시 해주세요 (429)${tail}`;
  if (code) return `알림 서버가 ${code} 로 거절했습니다${tail}`;
  return `보내지 못했습니다${tail}`;
}

/**
 * @param {object} keys  { publicKey, privateKey, contact }
 * @param {Array}  subs  [{ id, endpoint, p256dh, auth }]
 * @param {object} payload { title, body, url, tag }
 * @returns {{ sent:number, gone:string[], fails:Array, error:string|null }}
 *          gone = 지워야 할 구독 id
 *
 * ── 실패를 삼키지 않는다 (2026-08-07) ─────────────────────
 *
 * 원장님 — 테스트를 눌렀더니 「보냈어요」 라고 나오는데 폰에는 아무것도
 * 안 왔다.
 *
 * 여기가 그랬다. 404·410 만 챙기고 **나머지 오류는 통째로 버렸다.**
 * 그래서 애플이 400 으로 거절하든 열쇠가 틀려 401 이 오든, 부르는 쪽에는
 * `error: null` 이 돌아갔다. 「보냈어요」 는 **한 통도 안 갔을 때도** 나왔다.
 *
 * 이 앱에서 몇 번이나 겪은 그 모양이다 — 실패가 오류를 안 내고 성공처럼
 * 생긴 값으로 돌아온다. 화면도 로그도 멀쩡해 보이고, 원인은 폰에서 찾게 된다.
 *
 * 이제 **한 통도 못 갔으면 왜 못 갔는지**를 그대로 올려보낸다.
 */
export async function pushToAll(keys, subs, payload) {
  if (!keys?.publicKey || !keys?.privateKey) {
    return { sent: 0, gone: [], fails: [], error: "알림 키가 없어요." };
  }
  configure(keys);

  const body = JSON.stringify(payload);
  const gone = [];
  const fails = [];
  let sent = 0;

  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        sent += 1;
      } catch (e) {
        const code = e?.statusCode || 0;
        // 404/410 = 기기에서 알림을 껐거나 앱을 지운 것 → 구독을 지운다
        if (code === 404 || code === 410) gone.push(s.id);
        fails.push({
          code,
          who: whose(s.endpoint),
          why: (e?.body || e?.message || "").toString().trim(),
        });
      }
    })
  );

  /**
   * **한 통이라도 갔으면 성공으로 본다.** 기기 셋 중 하나가 옛것이라
   * 거절당하는 것은 흔하고, 그때마다 빨간 글씨를 띄우면 진짜 문제일 때
   * 눈에 안 들어온다. 다만 **한 통도 못 갔으면** 반드시 말한다.
   */
  let error = null;
  if (sent === 0 && fails.length > 0) {
    const f = fails[0];
    error = `${f.who}: ${reason(f.code, f.why)}`;
    if (fails.length > 1) error += ` (기기 ${fails.length}대 모두 실패)`;
  }

  return { sent, gone, fails, error };
}
