/* Sikhi University service worker — offline app shell + course data. */
var CACHE = "su-v4";
var SHELL = [
  "index.html", "catalog.html", "course.html", "dashboard.html", "cert.html",
  "search.html", "paths.html", "professors.html", "professor.html", "about.html",
  "feedback.html", "contact.html", "legal.html", "login.html", "teach.html", "admin.html",
  "assets/style.css", "assets/app.js", "assets/icon.svg",
  "assets/data/professors.json", "manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); })).catch(function () {}); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // Never cache API calls (auth/session/feedback/etc.) — always go to network.
  if (url.origin === location.origin && url.pathname.indexOf("/api/") === 0) return;
  if (url.origin !== location.origin) return;
  // The legacy shell must never retain lesson payloads after sign-out.
  if (/^\/(?:media|data)\//.test(url.pathname)) { e.respondWith(fetch(new Request(req,{cache:'no-store'}))); return; }
  // Network-first for public outline data.
  if (url.pathname.indexOf("courses.json") !== -1) {
    e.respondWith(fetch(req).then(function (r) { if(r.ok && !/private|no-store/i.test(r.headers.get('cache-control')||'')) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); } return r; }).catch(function () { return caches.match(req); }));
    return;
  }
  // Cache-first for the app shell.
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) { if(r.ok && !/private|no-store/i.test(r.headers.get('cache-control')||'')) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); } return r; }).catch(function () { return caches.match("index.html"); });
  }));
});
