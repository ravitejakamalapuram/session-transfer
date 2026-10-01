# e2e (Playwright)

Loads the built extension (`dist/`) in Chromium (persistent context), serves a local fixture site
(cookies 9, localStorage 31, sessionStorage 26, IndexedDB, Cache Storage; sizes via query string,
see `fixture-server.ts`) and drives the popup. `npm run test:e2e` builds then runs.

The popup is opened as a normal tab (a real toolbar popup cannot be driven by Playwright); the
fixture tab is brought to front and the popup reloaded so the service worker sees it as the
active tab.

`send-flow.spec.ts` "very large session" is the APP-315 reproduction: the package is above the
64 MiB port message limit and is now streamed in chunks. The error/timeout tests inject faults in
the popup page only (first collect port fails or stays silent) and check Retry works.
