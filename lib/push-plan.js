/** 알림 켜기 판단 한 벌(순수) — 기기마다 길이 다르다(옛 앱 lib/pushClient 의 셈을 그대로, 브라우저 값은 인자로 받는다).
 *    윈도우·안드로이드 — 크롬·엣지·파이어폭스 탭에서 그냥 된다 · 아이폰·아이패드 — 홈 화면에 담아야만(사파리 탭에서는 안 된다, iOS 16.4+) · 맥 — 크롬·엣지는 탭, 사파리는 「독에 추가」 */
export function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
/** 지금 이 기기가 무엇인가 — 아이패드는 최근 것부터 자기를 맥이라고 말한다(손가락이 닿는지로 가른다) */
export function deviceKind(ua = "", maxTouchPoints = 0) {
  const iPad = /Macintosh/.test(ua) && maxTouchPoints > 1;
  if (/iPhone|iPod/.test(ua) || iPad) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh/.test(ua)) return "mac";
  return "unknown";
}
/** 홈 화면(또는 독)에 담아서 연 것인가 */
export const isStandaloneOf = (win) => Boolean(win?.matchMedia?.("(display-mode: standalone)")?.matches || win?.navigator?.standalone === true);
/** 이 기기에서 알림을 켜려면 — { can, why, steps[] } */
export function howTo(kind, standalone) {
  if (kind === "ios" && !standalone) return { can: false, why: "아이폰은 앱을 홈 화면에 담아야 알림을 켤 수 있어요.", steps: ["사파리 아래쪽 가운데 [공유] 버튼을 누르세요 (네모에 위쪽 화살표).", "목록을 내려서 [홈 화면에 추가]를 누르세요.", "홈 화면에 생긴 클로이영어 아이콘으로 다시 여세요.", "그 화면에서 [알림 켜기]를 누르면 끝납니다."] };
  if (kind === "ios") return { can: true, why: null, steps: ["아래 [알림 켜기]를 누르고, 물어보면 [허용]을 누르세요."] };
  return { can: true, why: null, steps: ["아래 [알림 켜기]를 누르세요.", "브라우저가 물어보면 [허용]을 누르세요.", ...(kind === "mac" && !standalone ? ["사파리를 쓰신다면 [공유 → 독에 추가] 한 뒤 그 아이콘으로 열어주세요."] : [])] };
}
/** 왜 못 쓰는지 그대로 — 「쓸 수 없어요」 한 줄로는 아무도 못 고친다(원장님 2026-08-07). null 이면 쓸 수 있다 */
export function whyUnsupported({ kind, standalone, hasSW, hasPush }) {
  if (hasSW && hasPush) return null;
  if (kind === "ios") return standalone
    ? { why: "이 아이폰의 iOS 가 낮아서 알림을 쓸 수 없어요 (iOS 16.4 이상 필요).", fix: "설정 → 일반 → 소프트웨어 업데이트 를 해주세요." }
    : { why: "아이폰은 홈 화면에 담아서 연 앱에서만 알림을 켤 수 있어요.", fix: "사파리에서 [공유 → 홈 화면에 추가] 한 뒤, 생긴 아이콘으로 다시 열어주세요." };
  if (!hasSW) return { why: "이 브라우저에서는 알림을 쓸 수 없어요. 비공개(시크릿) 창일 수 있어요.", fix: "보통 창에서 다시 열어주세요. 크롬 · 엣지 · 파이어폭스에서 됩니다." };
  return { why: "이 브라우저가 알림을 지원하지 않아요.", fix: "크롬 · 엣지 · 파이어폭스에서 열어주세요." };
}
export const STATE_NAME = Object.freeze({ checking: "확인 중", on: "켜짐", off: "꺼짐", denied: "막힘", unsupported: "이 브라우저는 안 됨" });
