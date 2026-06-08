/* AztroTech Presupuesto — Service Worker (PWA offline) */
const CACHE = "azt-presupuesto-product-v3";

// Shell + librerías de CDN para arranque offline
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/styles.css",
  "./assets/state.js",
  "./assets/finance.js",
  "./assets/calendar.js",
  "./assets/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800;900&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // best-effort: si algún CDN falla no rompe la instalación
      Promise.allSettled(ASSETS.map((u) => c.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Nunca cachear llamadas a la API de Supabase (auth + datos siempre frescos)
  if (url.hostname.endsWith("supabase.co")) return;
  // Solo GET
  if (req.method !== "GET") return;

  // Navegaciones (abrir la app): red primero, cae a la copia cacheada
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Resto: cache primero, luego red (y guarda copia)
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
