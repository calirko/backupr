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
