import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

// Permission justification (see docs/browser-state-capabilities.md):
//   cookies      -> read/write HttpOnly & Secure cookies for the selected origin (chrome.cookies).
//   scripting    -> inject on-demand collector/restorer functions into the active tab to read/write
//                   localStorage, sessionStorage, IndexedDB and Cache Storage (origin-scoped, page context).
//   (tabs        -> not requested: the http/https host permissions already expose each tab's URL and title.)
//   storage      -> persist the on-device setting and the short-lived ready result.
//   host_permissions http/https -> the product must read & restore storage/cookies for ANY origin the
//                   user chooses; a fixed host list is impossible. No cross-origin data is ever mixed
//                   (strict origin binding). No <all_urls> content scripts run automatically -- injection
//                   is on-demand only, triggered explicitly by the user from the popup.
export default defineManifest({
  manifest_version: 3,
  name: 'Session Transfer',
  version: pkg.version,
  description:
    'Securely move an authenticated browser session between Chrome profiles or devices. Optional encryption, fully local, no server.',
  action: {
    default_popup: 'index.html',
    default_title: 'Session Transfer',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['cookies', 'scripting', 'storage'],
  host_permissions: ['http://*/*', 'https://*/*'],
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'",
  },
});
