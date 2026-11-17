// Offline support. The app's own files: try the internet first (so updates show up), fall back to the saved copy.
// The camera model, MediaPipe code and fonts: use the saved copy (they never change), download only the first time.
var APP = "gym-app-v7", LIB = "gym-lib-v1";
var FILES = ["./", "index.html", "coach.js?v=7", "camera.js?v=7", "extras.js?v=7", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(APP).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== APP && k !== LIB; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request; if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var cp = res.clone(); caches.open(APP).then(function (c) { c.put(req, cp); }); }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) { return m || (req.mode === "navigate" ? caches.match("index.html") : undefined); });
    }));
    return;
  }
  if (/cdn\.jsdelivr\.net|storage\.googleapis\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.open(LIB).then(function (c) {
      return c.match(req).then(function (m) {
        return m || fetch(req).then(function (res) { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; });
      });
    }));
  }
});
