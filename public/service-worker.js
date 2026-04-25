/* © 2026 Piansah — Mandarin Journey Service Worker v5 */
const CACHE_NAME = "mandarin-journey-v10";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/src/assets/icon.js",

  /* ── CSS ── */
  "/src/CSS/base.css",
  "/src/CSS/dashboard.css",
  "/src/CSS/layers.css",
  "/src/CSS/quiz.css",
  "/src/CSS/hanzi.css",
  "/src/CSS/kalimat.css",
  "/src/CSS/flashcard.css",
  "/src/CSS/petualangan.css",
  "/src/CSS/lesson.css",
  "/src/CSS/done-screen.css",
  "/src/CSS/speaking.css",
  "/src/CSS/auth.css",
  "/src/CSS/utils.css",
  "/src/CSS/avatar.css",
  "/src/CSS/grammar.css",
  "/src/CSS/cerita.css",
  "/src/CSS/level.css",
  "/src/CSS/srs-dashboard.css",
  "/src/CSS/onboarding.css",
  "/src/CSS/tour.css",
  "/src/CSS/search.css",
  "/src/CSS/nada.css",
  "/src/CSS/navbar.css",
  "/src/CSS/sosial.css",
  "/src/CSS/profile.css",
  "/src/CSS/app-init.css",
  "/src/CSS/tulis-hanzi.css",

  /* ── JS: core ── */
  "/src/JS/core/config.js",
  "/src/JS/core/auth.js",
  "/src/JS/core/navigation.js",
  "/src/JS/core/level.js",
  "/src/JS/core/done-screen.js",

  /* ── JS: utilities ── */
  "/src/JS/utilities/helpers.js",
  "/src/JS/utilities/pinyin.js",
  "/src/JS/utilities/tts.js",
  "/src/JS/utilities/xp.js",
  "/src/JS/utilities/sfx.js",
  "/src/JS/utilities/screen-anim.js",
  "/src/JS/utilities/stats-api.js",
  "/src/JS/utilities/tier-unlock.js",

  /* ── JS: features ── */
  "/src/JS/features/avatar.js",
  "/src/JS/features/cerita.js",
  "/src/JS/features/dashboard.js",
  "/src/JS/features/flashcard.js",
  "/src/JS/features/grammar.js",
  "/src/JS/features/hanzi.js",
  "/src/JS/features/kalimat.js",
  "/src/JS/features/kosakata.js",
  "/src/JS/features/nada.js",
  "/src/JS/features/profile.js",
  "/src/JS/features/quiz.js",
  "/src/JS/features/sosial.js",
  "/src/JS/features/speaking.js",
  "/src/JS/features/tulis-hanzi.js",

  /* ── JS: lesson (split module) ── */
  "/src/JS/lesson/check.js",
  "/src/JS/lesson/index.js",
  "/src/JS/lesson/mic.js",
  "/src/JS/lesson/nav.js",
  "/src/JS/lesson/render.js",
  "/src/JS/lesson/save.js",
  "/src/JS/lesson/state.js",

  /* ── JS: Petualangan (split module) ── */
  "/src/JS/petualangan/bg-card.js",
  "/src/JS/petualangan/petualangan-nodes.js",
  "/src/JS/petualangan/petualangan-overlay.js",
  "/src/JS/petualangan/petualangan-picker.js",
  "/src/JS/petualangan/petualangan-tier.js",
  "/src/JS/petualangan/petualangan-tooltip.js",
  "/src/JS/petualangan/petualangan.js",

  /* ── JS: app ── */
  "/src/JS/app/onboarding.js",
  "/src/JS/app/app-init.js",
  "/src/JS/app/pwa-install.js",
];

/* Halaman statis yang harus di-fetch langsung dari network */
const STATIC_PAGES = ["/privacy.html", "/terms.html"];

/* ── Install: cache semua static assets ── */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

/* ── Activate: hapus cache lama ── */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

/* ── Fetch ── */
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Jangan intercept request eksternal (Supabase, CDN, dll)
  if (url.origin !== self.location.origin) return;

  // Navigasi (refresh/buka app) — network-first, fallback ke cache
  if (request.mode === "navigate") {
    if (STATIC_PAGES.includes(url.pathname)) {
      e.respondWith(fetch(request));
      return;
    }
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // JS & CSS — network-first agar tidak serve file lama
  const isJsOrCss =
    url.pathname.endsWith(".js") || url.pathname.endsWith(".css");

  if (isJsOrCss) {
    // Network-first: selalu ambil versi terbaru, fallback ke cache kalau offline
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Asset lain (icons, dll) — cache-first, update di background
  e.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => null);
      return cached || fetchPromise;
    }),
  );
});

/* ── Push: Tampilkan notifikasi ── */
self.addEventListener("push", (e) => {
  if (!e.data) return;
  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: "Mandarin Journey", body: e.data.text() };
  }
  const title = payload.title || "Mandarin Journey";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "mandarin-journey",
    data: { url: payload.url || "/", tag: payload.tag || "" },
    requireInteraction: false,
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification Click ── */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || "/";
  e.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      }),
  );
});
