/** 웹 푸시 한 벌 — webpush.sendNotification 을 부르는 자리는 여기뿐(검사-①). 부르는 쪽은 lib/notify.js 하나(대전제-7). 문자와 달리 건당 비용이 없다.
 *  열쇠(VAPID)는 v2.integration 의 push 줄(옛 앱 설정에서 0072 가 옮겼다 — 주소·열쇠가 같아야 이미 켠 기기가 산다) */
import webpush from "web-push";
export function configure({ publicKey, privateKey, contact }) { webpush.setVapidDetails(contact || "mailto:noreply@chloe-eng.internal", publicKey, privateKey); }
/** 어느 회사 알림 서버인가 — 애플·구글이 거절하는 까닭이 서로 다르다 */
export const whose = (endpoint = "") => (/apple/.test(endpoint) ? "아이폰" : /google|fcm/.test(endpoint) ? "안드로이드·크롬" : /mozilla/.test(endpoint) ? "파이어폭스" : "알 수 없는 기기");
/** 왜 거절당했는지 사람 말로 — 숫자만 보여드리면 뜻이 없고 안 보여드리면 못 고친다. 둘 다 적는다 */
export function reason(code, body = "") {
  const tail = body ? ` — ${body.slice(0, 120)}` : "";
  if (code === 400) return `알림 키가 이 기기와 안 맞습니다 (400). 기기에서 알림을 껐다 다시 켜주세요${tail}`;
  if (code === 401 || code === 403) return `알림 열쇠가 거절됐습니다 (${code}). 알림 키를 다시 만들고 기기마다 알림을 다시 켜야 합니다${tail}`;
  if (code === 404 || code === 410) return `기기가 알림을 껐거나 앱을 지웠습니다 (${code})`;
  if (code === 413) return `내용이 너무 깁니다 (413)${tail}`;
  if (code === 429) return `잠시 뒤에 다시 해주세요 (429)${tail}`;
  if (code) return `알림 서버가 ${code} 로 거절했습니다${tail}`;
  return `보내지 못했습니다${tail}`;
}
/** 기기마다 제 짐(payloadFor(기기) — r 은 그 사람의 자취 번호)을 싣는다. 실패를 삼키지 않는다(옛 앱 2026-08-07 사고: 404·410 만 챙기고 나머지를 버려 「보냈어요」가 한 통도 안 갔을 때도 나왔다).
 *  404·410 은 기기가 알림을 끈 것 — gone 으로 돌려주면 부르는 쪽이 revoked_at 을 찍는다(지우지 않는다, 대전제-6) */
export async function pushToAll(keys, subs, payloadFor) {
  if (!keys?.publicKey || !keys?.privateKey) throw new Error("알림 열쇠가 없습니다 — 연동(v2.integration) push 줄에 publicKey·privateKey 가 있어야 합니다(0072 가 옛 앱에서 옮겼다)");
  configure(keys);
  const sentTo = [], gone = [], fails = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payloadFor(s))); sentTo.push(s.id); }
    catch (e) {
      const code = e?.statusCode || 0;
      if (code === 404 || code === 410) gone.push(s.id);
      fails.push({ id: s.id, profile_id: s.profile_id, code, who: whose(s.endpoint), why: `${whose(s.endpoint)}: ${reason(code, String(e?.body || e?.message || "").trim())}` });
    }
  }));
  return { sentTo, gone, fails };
}
