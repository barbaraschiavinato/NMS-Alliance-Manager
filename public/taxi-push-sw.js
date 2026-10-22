self.addEventListener("push", (event) => {
  if (!event.data) return;
  const alert = event.data.json();
  const path = typeof alert.path === "string" && /^\/taxi(?:\/[a-zA-Z0-9-]+)?$/.test(alert.path)
    ? alert.path : "/taxi";
  event.waitUntil(self.registration.showNotification(alert.title || "Taxi", {
    body: alert.body,
    tag: alert.tag,
    data: { path },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path;
  const target = new URL(typeof path === "string" && /^\/taxi(?:\/[a-zA-Z0-9-]+)?$/.test(path) ? path : "/taxi", self.location.origin);
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      if (new URL(client.url).origin === target.origin && "navigate" in client) {
        await client.navigate(target.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  }));
});
