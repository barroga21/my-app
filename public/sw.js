const CACHE_NAME = "hibi-app-shell-v3";
const APP_SHELL = [
  "/",
  "/habits",
  "/today",
  "/calendar",
  "/profile",
  "/journal",
  "/review",
  "/tags",
  "/manifest.json",
  "/icon.svg",
  "/og-image.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});

// Push notification support
self.addEventListener("push", (event) => {
  let data = { title: "Hibi", body: "Time to check in with yourself." };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // fallback to default
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Hibi", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag || "hibi-notification",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// Handle messages from the app (local notifications)
self.addEventListener("message", (event) => {
  if (event.data?.type === "HIBI_SHOW_NOTIFICATION") {
    self.registration.showNotification(event.data.title || "Hibi", {
      body: event.data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: event.data.tag || "hibi-local",
      data: { url: "/" },
    });
  }
});
