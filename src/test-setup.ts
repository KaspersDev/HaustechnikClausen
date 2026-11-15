// jsdom kennt kein matchMedia; Ionic (z. B. ion-split-pane) braucht es.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Feste Zeitzone, damit Datums- und Uhrzeittests überall gleich laufen.
const prozess = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
if (prozess) {
  prozess.env['TZ'] = 'Europe/Berlin';
}
