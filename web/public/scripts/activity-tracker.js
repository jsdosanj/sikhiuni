// Real "active time" tracking for the dashboard streak/heatmap. Ported
// verbatim (same thresholds, same reasoning) from the sibling sikhi.io
// repo's lib/activity/tracker.ts — duplicated, not shared, per this whole
// project family's convention for small client-side modules.
//
// The previous streak (dashboard.astro's own `streak()`) read a purely
// local `activity` array from localStorage: per-device, lost on cleared
// storage, and never actually measured engagement — any recorded day
// counted, however briefly the tab was open. This tracks genuine
// mouse/keyboard/scroll/touch activity, only while the tab is visible,
// only while the visitor isn't idle, and persists it server-side so it
// follows the account across devices.
(function () {
  const IDLE_THRESHOLD_MS = 30_000;
  const TICK_MS = 5_000;
  const FLUSH_MS = 60_000;
  const MAX_SECONDS_PER_FLUSH = 120;
  const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "wheel", "touchstart", "touchmove"];

  let lastInteraction = Date.now();
  let pendingSeconds = 0;
  let started = false;

  function onActivity() {
    lastInteraction = Date.now();
  }

  function tick() {
    const now = Date.now();
    const isIdle = now - lastInteraction > IDLE_THRESHOLD_MS;
    const isVisible = document.visibilityState === "visible";
    if (!isIdle && isVisible) pendingSeconds += TICK_MS / 1000;
  }

  function flush(useBeacon) {
    if (pendingSeconds <= 0) return;
    const activeSeconds = Math.min(Math.round(pendingSeconds), MAX_SECONDS_PER_FLUSH);
    pendingSeconds = 0;
    const body = JSON.stringify({ activeSeconds });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/activity/heartbeat", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/activity/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "same-origin",
        keepalive: true,
      }).catch(function () {});
    }
  }

  function start() {
    if (started) return;
    started = true;
    ACTIVITY_EVENTS.forEach(function (evt) {
      window.addEventListener(evt, onActivity, { passive: true });
    });
    setInterval(tick, TICK_MS);
    setInterval(function () { flush(false); }, FLUSH_MS);
    window.addEventListener("pagehide", function () { flush(true); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush(true);
    });
  }

  // Only track signed-in visitors — /api/me is already the standard way
  // every page on this site checks session state (see Nav.astro's own
  // fetch('/api/me') for the sign-in/out swap), so this reuses that rather
  // than inventing a second signal.
  fetch("/api/me", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : { user: null }; })
    .then(function (d) { if (d && d.user) start(); })
    .catch(function () {});
})();
