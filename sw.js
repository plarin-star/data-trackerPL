/* Service worker: lets the site install as an app and open offline.

   Online:  every request goes to the network first, so the pages always show
            the newest data; each answer is saved in the cache.
   Offline: the saved copy from the cache is used instead, so the site still
            opens and shows the last data it loaded. */

const CACHE = "fitness-tracker-v1";
const SHELL = [
  "./",
  "index.html",
  "browse.html",
  "trends.html",
  "manifest.webmanifest",
  "assets/style.css",
  "assets/app.js",
  "assets/today.js",
  "assets/browse.js",
  "assets/trends.js",
  "assets/vendor/chart.umd.js",
  "assets/fonts/barlow-latin-400-normal.woff2",
  "assets/fonts/barlow-latin-500-normal.woff2",
  "assets/fonts/barlow-latin-600-normal.woff2",
  "assets/fonts/barlow-condensed-latin-600-normal.woff2",
  "assets/fonts/barlow-condensed-latin-700-normal.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/favicon-64.png",
  "data/history.csv",
  "data/status.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return resp;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) =>
          hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())
        )
      )
  );
});
