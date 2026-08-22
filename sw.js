const SHELL_CACHE = "groceries-shell-v2";
const FONT_CACHE = "groceries-fonts-v1";
const SHELL_ASSETS = ["/", "/index.html", "/app.js", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put("/index.html", copy));
          return res;
        })
        .catch(() =>
          caches
            .match("/index.html")
            .then((hit) => hit || caches.match("/")),
        ),
    );
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        const network = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((hit) => {
        const network = fetch(event.request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});
