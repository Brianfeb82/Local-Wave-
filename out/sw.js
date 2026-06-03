const CACHE_NAME = "localwave-app-v2";
const SCOPE_PATH = "/Local-Wave-";

// App shell files yang pasti dibutuhkan
const APP_SHELL = [
  `${SCOPE_PATH}/`,
  `${SCOPE_PATH}/manifest.webmanifest`,
  `${SCOPE_PATH}/icons/icon.svg`,
  `${SCOPE_PATH}/favicon.ico.png`,
];

// Install: cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: hapus cache lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: strategi Cache First untuk asset statis, Network First untuk navigasi
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Abaikan request ke luar origin
  if (url.origin !== self.location.origin) return;

  // Abaikan Chrome extensions
  if (url.protocol === "chrome-extension:") return;

  // Navigasi (HTML): Network first, fallback ke cache
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Simpan ke cache saat berhasil fetch
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(`${SCOPE_PATH}/`))
    );
    return;
  }

  // Asset statis Next.js (_next/static): Cache First (tidak pernah berubah)
  if (url.pathname.startsWith(`${SCOPE_PATH}/_next/static/`)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Semua request lain: Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic")
          return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
      return cached || fetchPromise;
    })
  );
});
