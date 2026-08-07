self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = clients[0];
    if (client) {
      await client.focus();
      if (taskId) client.postMessage({ type: "open-reminder-task", taskId });
      return;
    }
    await self.clients.openWindow("./");
  })());
});
