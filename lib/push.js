import webpush from "web-push";

// 웹 푸시 — 문자와 달리 건당 비용이 없다.
// 보내는 데 필요한 키(VAPID)는 설정 화면에서 한 번 만들어 integrations 에 저장한다.

export function generateKeys() {
  return webpush.generateVAPIDKeys(); // { publicKey, privateKey }
}

function configure({ publicKey, privateKey, contact }) {
  webpush.setVapidDetails(contact || "mailto:noreply@example.com", publicKey, privateKey);
}

/**
 * @param {object} keys  { publicKey, privateKey, contact }
 * @param {Array}  subs  [{ id, endpoint, p256dh, auth }]
 * @param {object} payload { title, body, url, tag }
 * @returns {{ sent:number, gone:string[] }}  gone = 지워야 할 구독 id
 */
export async function pushToAll(keys, subs, payload) {
  if (!keys?.publicKey || !keys?.privateKey) {
    return { sent: 0, gone: [], error: "알림 키가 없어요." };
  }
  configure(keys);

  const body = JSON.stringify(payload);
  const gone = [];
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
        // 404/410 = 기기에서 알림을 껐거나 앱을 지운 것 → 구독을 지운다
        if (e?.statusCode === 404 || e?.statusCode === 410) gone.push(s.id);
      }
    })
  );

  return { sent, gone, error: null };
}
