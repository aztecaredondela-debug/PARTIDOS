const V = "sar-v1", BASE = ["./", "index.html", "app.js", "manifest.json", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(BASE))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin === location.origin) {            // la app: red primero, caché si no hay conexión
    e.respondWith(fetch(e.request).then(r => { caches.open(V).then(c => c.put(e.request, r.clone())); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
  } else if (u.hostname === "cdnjs.cloudflare.com") {   // librería de Excel: caché primero
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { caches.open(V).then(c => c.put(e.request, n.clone())); return n; })));
  }                                              // los datos de la federación nunca pasan por aquí
});
