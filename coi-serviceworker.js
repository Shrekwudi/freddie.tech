/* Cross-origin isolation service worker.

   GitHub Pages can't send custom HTTP headers, but Python's input() needs
   SharedArrayBuffer, which browsers only allow on "cross-origin isolated" pages.
   This file is used twice:
     1. as a normal <script> on the page: it registers itself as a service worker
        and reloads the page once;
     2. as the service worker: it adds the COOP/COEP headers to every response.
   Based on the approach used by the MIT-licensed coi-serviceworker project. */

if (typeof window === "undefined") {
  // ---------------- service worker side ----------------
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  function withHeaders(response, sameOrigin) {
    if (!response || response.status === 0 || response.type === "opaqueredirect") return response;
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    if (sameOrigin) {
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;
    if (req.method !== "GET") return;
    const sameOrigin = new URL(req.url).origin === self.location.origin;

    event.respondWith((async () => {
      if (sameOrigin) {
        return withHeaders(await fetch(req), true);
      }
      // Cross-origin files (e.g. Python from the CDN): fetch them with CORS so we
      // can mark them as allowed for an isolated page.
      try {
        const res = await fetch(req.url, { mode: "cors", credentials: "omit" });
        return withHeaders(res, false);
      } catch (e) {
        return fetch(req);
      }
    })());
  });
} else {
  // ---------------- page side ----------------
  (() => {
    if (window.crossOriginIsolated) return;
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
    const KEY = "coi-reloaded";
    let reloaded = null;
    try { reloaded = sessionStorage.getItem(KEY); } catch (e) {}

    navigator.serviceWorker.register(document.currentScript.src).then((reg) => {
      const reloadOnce = () => {
        if (reloaded) return; // avoid reload loops if isolation still fails
        try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
        window.location.reload();
      };
      if (navigator.serviceWorker.controller) {
        // a worker is active but this page wasn't isolated: reload through it
        reloadOnce();
      } else {
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw && sw.addEventListener("statechange", () => { if (sw.state === "activated") reloadOnce(); });
        });
        if (reg.active) reloadOnce();
      }
    }, (err) => console.warn("coi-serviceworker failed to register:", err));
  })();
}
