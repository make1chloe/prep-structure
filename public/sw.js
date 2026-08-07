// 알림을 받아 화면에 띄우고, 누르면 앱을 연다
/**
 * 알림 한 통이 어디까지 갔는지 알려준다 (0105).
 *
 * `r` 은 그 통의 표 번호다. 서버가 실어 보낸다. 없으면 아무것도 안 한다.
 * 실패해도 조용히 넘어간다 — 세는 일 때문에 알림이 안 뜨면 본말이 뒤집힌다.
 */
function ping(r, opened) {
  if (!r) return Promise.resolve();
  return fetch("/api/push/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ r, opened: !!opened }),
  }).catch(() => {});
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "클로이영어", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "클로이영어";
  const options = {
    body: data.body || "",
    icon: "/api/icon/192",
    badge: "/api/icon/192",
    tag: data.tag || "chloe",
    data: { url: data.url || "/me", r: data.r || null },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      ping(data.r, false),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/me";
  const r = event.notification.data?.r || null;
  event.waitUntil(
    Promise.all([
      ping(r, true),
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        for (const c of list) {
          if (c.url.includes(url) && "focus" in c) return c.focus();
        }
        return clients.openWindow(url);
      }),
    ])
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
