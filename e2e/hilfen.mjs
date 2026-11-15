import { chromium } from 'playwright';

export const URL = process.env.E2E_URL ?? 'http://localhost:4200';

/** Tablet im Querformat mit Touch-Eingabe und leerer Datenbank. */
export async function starte() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
  await page.goto(URL);
  await page.waitForSelector('ion-menu');
  return { browser, context, page, fehler };
}

/** Die gerade sichtbare Seite (Ionic behält frühere Seiten versteckt im DOM). */
export const seite = (page, selektor) => page.locator(`${selektor}:not(.ion-page-hidden)`).last();

/** Wartet das Ende eines Seitenwechsels ab (Ionic blendet Seiten animiert ein). */
export async function ruhig(page) {
  await page.waitForTimeout(300);
  await page.waitForFunction(
    () => !document.querySelector('.ion-page.ion-page-invisible, ion-router-outlet .ion-page[aria-hidden="true"]:not(.ion-page-hidden)'),
  );
  await page.waitForTimeout(400);
}

export async function menue(page, titel) {
  await page.locator('ion-menu ion-item', { hasText: titel }).click();
  await ruhig(page);
}

export async function fuelle(bereich, feld, wert) {
  await bereich.locator(`[formControlName="${feld}"] input, [formControlName="${feld}"] textarea`).fill(wert);
}

export async function kundeAnlegen(page, { name, strasse, plz, ort }) {
  await menue(page, 'Kunden');
  const s = seite(page, 'app-kunden-page');
  await s.locator('ion-button.neu').click();
  await fuelle(s, 'name', name);
  await fuelle(s, 'strasse', strasse);
  await fuelle(s, 'plz', plz);
  await fuelle(s, 'ort', ort);
  await s.locator('ion-button.speichern').click();
  await s.locator('.split-liste ion-item', { hasText: name }).waitFor();
}

export async function artikelAnlegen(page, { typ, bezeichnung, preis, stundensatz = false }) {
  await menue(page, 'Artikel');
  const s = seite(page, 'app-artikel-page');
  await s.locator('ion-button.neu').click();
  await s.locator('.split-detail ion-segment-button', { hasText: typ }).click();
  await fuelle(s, 'bezeichnung', bezeichnung);
  await fuelle(s, 'preis', preis);
  if (stundensatz) await s.locator('ion-checkbox').click();
  await s.locator('ion-button.speichern').click();
  await s.locator('.split-liste ion-item', { hasText: bezeichnung }).waitFor();
}

/** Legt einen Auftrag an und lässt die Detailseite geöffnet. */
export async function auftragAnlegen(page, { kunde, titel }) {
  await menue(page, 'Aufträge');
  await seite(page, 'app-auftraege-page').locator('ion-button.neu').click();
  let s = seite(page, 'app-auftrag-detail-page');
  await s.locator('.kundentreffer', { hasText: kunde }).click();
  await fuelle(s, 'titel', titel);
  await s.locator('ion-button.speichern').click();
  await page.waitForURL(/\/auftraege\/[0-9a-f-]{36}$/);
  await ruhig(page);
  s = seite(page, 'app-auftrag-detail-page');
  await s.locator('app-zeiten-karte').waitFor();
  return s;
}

/** Zieht ein Element mit dem Finger auf ein Ziel (echte Touch-Ereignisse über CDP). */
export async function zieheMitFinger(page, von, nach, { versatzY = 0 } = {}) {
  const a = await von.boundingBox();
  const b = await nach.boundingBox();
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const ziel = { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 60) + versatzY };
  const cdp = await page.context().newCDPSession(page);
  const finger = (type, punkt) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: punkt ? [{ x: Math.round(punkt.x), y: Math.round(punkt.y) }] : [],
    });
  await finger('touchStart', start);
  await page.waitForTimeout(250); // länger als die Start-Verzögerung des Boards
  for (let i = 1; i <= 12; i++) {
    await finger('touchMove', {
      x: start.x + ((ziel.x - start.x) * i) / 12,
      y: start.y + ((ziel.y - start.y) * i) / 12,
    });
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(100);
  await finger('touchEnd');
  await page.waitForTimeout(500);
  await cdp.detach();
}
