// Service worker Chef2Box : affiche les notifications (rappel du soir,
// bilan du lundi) et ouvre l'appli quand on touche la notification.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let donnees = {};
  try {
    donnees = event.data ? event.data.json() : {};
  } catch {
    donnees = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(donnees.title || "Chef2Box", {
      body: donnees.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: donnees.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if (f.url.startsWith(self.location.origin) && "focus" in f) {
          f.navigate(url);
          return f.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
