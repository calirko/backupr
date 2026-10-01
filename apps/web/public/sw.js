const CACHE_NAME = "images-v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const isImageRequest = (request) => {
  try {
    const url = new URL(request.url);
    return /\.(png|jpg|jpeg|gif|svg|webp|ico|avif)(\?.*)?$/i.test(
      url.pathname
    );
  } catch {
    return false;
  }
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!isImageRequest(event.request)) return;
  event.respondWith(handleImage(event.request));
});

async function handleImage(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    const cachedAt = Number(cached.headers.get("sw-cached-at") ?? 0);
    if (Date.now() - cachedAt < MAX_AGE_MS) {
      return cached;
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set("sw-cached-at", String(Date.now()));
      const body = await response.clone().arrayBuffer();
      cache.put(
        request,
        new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      );
    }
    return response;
  } catch {
    if (cached) return cached;
    throw new Error(`Failed to fetch: ${request.url}`);
  }
}

// ─── Push notifications ──────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Backupr", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(showUnlessVisible(data));
});

// While the app is on screen the server's socket message already shows a
// toast, so the desktop notification is only for when it isn't.
async function showUnlessVisible(data) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  if (windows.some((client) => client.visibilityState === "visible")) return;

  await self.registration.showNotification(data.title || "Backupr", {
    body: data.body || "",
    tag: data.tag,
    icon: "/icon.png",
    badge: "/icon.png",
    data: { url: data.url || "/" },
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin)
    .href;
  event.waitUntil(focusOrOpen(url));
});

async function focusOrOpen(url) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const existing = windows.find(
    (client) => new URL(client.url).origin === self.location.origin
  );
  if (existing) {
    await existing.focus();
    if (existing.url !== url && "navigate" in existing) {
      await existing.navigate(url).catch(() => {});
    }
    return;
  }
  await self.clients.openWindow(url);
}
