// 알림을 받아 화면에 띄우고, 누르면 앱을 연다
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
    data: { url: data.url || "/me" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/me";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
