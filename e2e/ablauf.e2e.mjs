// Durchgängiger Ablauf: Kunde → Auftrag → Zeiten/Material → Erledigt → Rechnung →
// Festschreiben → PDF → Datensicherung.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import {
  artikelAnlegen,
  auftragAnlegen,
  fuelle,
  kundeAnlegen,
  menue,
  ruhig,
  seite,
  starte,
} from './hilfen.mjs';

let app;
let page;

const texte = (bereich, selektor) =>
  bereich
    .locator(selektor)
    .allTextContents()
    .then((liste) => liste.map((t) => t.replace(/\s+/g, ' ').trim()));

async function ladeHerunter(ausloeser) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), ausloeser()]);
  return { name: download.suggestedFilename(), inhalt: await readFile(await download.path()) };
}

async function bestaetige(knopf) {
  const frage = page.locator('ion-alert');
  await frage.waitFor();
  await frage.locator('button', { hasText: knopf }).click();
  await frage.waitFor({ state: 'detached' });
}

before(async () => {
  app = await starte();
  page = app.page;
});

after(() => app?.browser.close());

test('Firmendaten hinterlegen', async () => {
  await menue(page, 'Einstellungen');
  const s = seite(page, 'app-einstellungen-page');
  await fuelle(s, 'name', 'Haustechnik Clausen');
  await fuelle(s, 'strasse', 'Werftstraße 12');
  await fuelle(s, 'plz', '24103');
  await fuelle(s, 'ort', 'Kiel');
  await fuelle(s, 'steuernummer', '20/123/45678');
  await fuelle(s, 'bankIban', 'DE89 3704 0044 0532 0130 00');
  await s.locator('ion-button.speichern').click();
  await page.locator('ion-toast').waitFor({ state: 'attached' });
  assert.equal(await s.locator('.fehlerliste').count(), 0);
});

test('Kunde und Artikel anlegen', async () => {
  await kundeAnlegen(page, { name: 'Erika Müller', strasse: 'Hafenweg 3', plz: '24103', ort: 'Kiel' });
  await artikelAnlegen(page, { typ: 'Arbeit', bezeichnung: 'Monteurstunde', preis: '58', stundensatz: true });
  await artikelAnlegen(page, { typ: 'Material', bezeichnung: 'Zaunlatte', preis: '8,95' });
  await artikelAnlegen(page, { typ: 'Anfahrt', bezeichnung: 'Anfahrt Stadtgebiet', preis: '25' });
  const preise = await texte(seite(page, 'app-artikel-page'), '.split-liste ion-note');
  assert.deepEqual(preise, ['25,00 € / pauschal', '58,00 € / Std', '8,95 € / Stk']);
});

test('Auftrag anlegen, Zeiten und Material erfassen, erledigen', async () => {
  const auftrag = await auftragAnlegen(page, { kunde: 'Erika Müller', titel: 'Zaun reparieren' });
  assert.match(await auftrag.locator('ion-title').textContent(), /AU-\d{4}-0001 · Zaun reparieren/);

  const zeiten = auftrag.locator('app-zeiten-karte');
  await fuelle(zeiten, 'von', '08:00');
  await fuelle(zeiten, 'bis', '12:30');
  await fuelle(zeiten, 'taetigkeit', 'Zaun gesetzt');
  await zeiten.locator('.hinzufuegen').click();
  await zeiten.locator('.eintrag').waitFor();
  assert.deepEqual(await texte(zeiten, '.summe'), ['Summe: 4:30 h']);

  const material = auftrag.locator('app-material-karte');
  await material.locator('.artikeltreffer', { hasText: 'Zaunlatte' }).click();
  await fuelle(material, 'menge', '12');
  await material.locator('.hinzufuegen').click();
  await material.locator('.eintrag').first().waitFor();
  await material.locator('.artikeltreffer', { hasText: 'Anfahrt' }).click();
  await material.locator('.hinzufuegen').click();
  await material.locator('.eintrag').nth(1).waitFor();
  assert.deepEqual(await texte(material, '.summe'), ['Summe netto: 132,40 €']);

  await auftrag.locator('ion-segment-button', { hasText: 'Erledigt' }).click();
  await auftrag.locator('.rechnung-erzeugen').waitFor();
});

test('Rechnung aus dem Auftrag erzeugen: Zeiten, Material und Anfahrt sind übernommen', async () => {
  await seite(page, 'app-auftrag-detail-page').locator('.rechnung-erzeugen').click();
  await page.waitForURL(/\/rechnungen\/[0-9a-f-]{36}$/);
  await ruhig(page);
  const rechnung = seite(page, 'app-rechnung-detail-page');
  assert.match(await rechnung.locator('ion-title').textContent(), /Rechnungsentwurf/);
  assert.deepEqual(await texte(rechnung, '.zeilenbetrag'), ['261,00 €', '107,40 €', '25,00 €']);
  assert.deepEqual(await texte(rechnung, '.summen dd'), [
    '261,00 €',
    '107,40 €',
    '25,00 €',
    '393,40 €',
    '74,75 €',
    '468,15 €',
  ]);
});

test('Festschreiben vergibt die Rechnungsnummer und sperrt die Rechnung', async () => {
  const rechnung = seite(page, 'app-rechnung-detail-page');
  await rechnung.locator('.festschreiben').click();
  await bestaetige('Festschreiben');
  await rechnung.locator('.positionstabelle').waitFor();
  assert.match(await rechnung.locator('ion-title').textContent(), /Rechnung RE-\d{4}-0001/);
  assert.equal(await rechnung.locator('.festschreiben').count(), 0);
  assert.equal(await rechnung.locator('form').count(), 0);
  assert.deepEqual(await texte(rechnung, '.status'), ['Versendet']);
});

test('PDF der Rechnung wird erzeugt', async () => {
  const rechnung = seite(page, 'app-rechnung-detail-page');
  const pdf = await ladeHerunter(() => rechnung.locator('.pdf').click());
  assert.match(pdf.name, /^Rechnung-RE-\d{4}-0001\.pdf$/);
  assert.equal(pdf.inhalt.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.inhalt.length > 10_000);
});

test('der Auftrag steht auf dem Board unter „Abgerechnet" und ist fixiert', async () => {
  await menue(page, 'Aufträge');
  const board = seite(page, 'app-auftraege-page');
  const karte = board.locator('.spalte[data-status="Abgerechnet"] .auftragskarte');
  await karte.waitFor();
  assert.match(await karte.textContent(), /Zaun reparieren/);
  assert.match(await karte.getAttribute('class'), /cdk-drag-disabled/);
});

test('die Rechnung steht in der Rechnungsliste', async () => {
  await menue(page, 'Rechnungen');
  const liste = seite(page, 'app-rechnungen-page');
  const zeilen = await texte(liste, '.rechnung h2');
  assert.equal(zeilen.length, 1);
  assert.match(zeilen[0], /^RE-\d{4}-0001 Versendet$/);
  assert.deepEqual(await texte(liste, '.rechnung ion-note'), ['468,15 €']);
});

test('die Datensicherung lässt sich exportieren', async () => {
  await menue(page, 'Einstellungen');
  const s = seite(page, 'app-einstellungen-page');
  const sicherung = await ladeHerunter(() => s.locator('.exportieren').click());
  assert.match(sicherung.name, /^haustechnik-sicherung-\d{4}-\d{2}-\d{2}\.sqlite$/);
  assert.equal(sicherung.inhalt.subarray(0, 15).toString(), 'SQLite format 3');
});

test('die Daten überstehen einen Neustart der App', async () => {
  await page.waitForTimeout(600);
  await page.reload();
  await menue(page, 'Rechnungen');
  await seite(page, 'app-rechnungen-page').locator('.rechnung').waitFor();
});

test('es sind keine Browser-Fehler aufgetreten', () => {
  assert.deepEqual(app.fehler, []);
});
