self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const title = payload.title || "초록이한자학습";
  const options = {
    body: payload.body || "새 학습 일차가 열렸어요.",
    badge: "/chologi-icon-192.png",
    icon: "/chologi-icon-192.png",
    data: {
      url: payload.url || "/student"
    }
  };

  event.waitUntil((async () => {
    if (self.navigator?.setAppBadge) {
      await self.navigator.setAppBadge(Number(payload.badge || 1)).catch(() => {});
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/student";

  event.waitUntil((async () => {
    if (self.navigator?.clearAppBadge) {
      await self.navigator.clearAppBadge().catch(() => {});
    }
    const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingClient = windowClients.find((client) => {
      try {
        return new URL(client.url).pathname.startsWith("/student");
      } catch {
        return false;
      }
    });
    if (existingClient) {
      await existingClient.focus();
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}
