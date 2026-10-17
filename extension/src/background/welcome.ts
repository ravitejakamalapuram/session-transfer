/** Opens the bundled welcome page once, on a fresh install only (not on update or Chrome update). */
export function openWelcomeOnInstall(details: chrome.runtime.InstalledDetails): void {
  if (details.reason !== 'install') return;
  chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }).catch(() => undefined);
}
