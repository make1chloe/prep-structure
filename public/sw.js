/* 알림 프로그램 — ⚠️ **옛 것과 같은 모양을 지킨다** (docs/서비스워커-계약서.md)
 * 전환 첫 주는 폰에 박힌 옛 SW 가 알림을 받는다. 모양이 다르면 알림이 아예 안 뜨거나
 * 눌렀을 때 404 가 되고, 원장님 PC 에서는 멀쩡해서 며칠간 모른다. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const title = d.title || "클로이영어";
  e.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: d.body || "",                       // ⚠️ 본문은 보내는 쪽이 이미 갈아 끼웠다
      tag: d.tag || "chloe",                    // ⚠️ 같은 tag 는 앞엣것을 덮는다
      icon: "/api/icon/192", badge: "/api/icon/192",
      data: { url: d.url || "/me", r: d.r ?? null },
    });
    // 받은 때 — ⚠️ 실패해도 조용히 넘어간다. 세는 일 때문에 알림이 안 뜨면 본말이 뒤집힌다
    if (d.r != null) await seen(d.r, false).catch(() => {});
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/me";
  const r = e.notification.data && e.notification.data.r;
  e.waitUntil((async () => {
    if (r != null) await seen(r, true).catch(() => {});
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) if (c.url.includes(url)) return c.focus();
    return self.clients.openWindow(url);
  })());
});

function seen(r, opened) {
  return fetch("/api/push/seen", {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ r, opened }),
  });
}
