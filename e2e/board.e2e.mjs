import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  auftragAnlegen,
  kundeAnlegen,
  menue,
  ruhig,
  seite,
  starte,
  zieheMitFinger,
} from './hilfen.mjs';

let app;
let board;

const spalte = (status) => board.locator(`.spalte[data-status="${status}"]`);
const titel = (status) => spalte(status).locator('.auftragskarte h3').allTextContents();
const karte = (text) => board.locator('.auftragskarte', { hasText: text });

before(async () => {
  app = await starte();
  await kundeAnlegen(app.page, { name: 'Erika Müller', strasse: 'Hafenweg 3', plz: '24103', ort: 'Kiel' });
  await auftragAnlegen(app.page, { kunde: 'Erika Müller', titel: 'Zaun reparieren' });
  await auftragAnlegen(app.page, { kunde: 'Erika Müller', titel: 'Trockenbau Flur' });
  await menue(app.page, 'Aufträge');
  board = seite(app.page, 'app-auftraege-page');
  await karte('Trockenbau Flur').waitFor();
});

after(() => app?.browser.close());

test('neue Aufträge stehen in „Offen"', async () => {
  assert.deepEqual(await titel('Offen'), ['Zaun reparieren', 'Trockenbau Flur']);
  assert.deepEqual(await titel('InArbeit'), []);
});

test('eine Karte lässt sich mit dem Finger in eine andere Spalte ziehen', async () => {
  await zieheMitFinger(app.page, karte('Zaun reparieren'), spalte('InArbeit').locator('.karten-liste'));
  assert.deepEqual(await titel('Offen'), ['Trockenbau Flur']);
  assert.deepEqual(await titel('InArbeit'), ['Zaun reparieren']);
});

test('der neue Status bleibt nach dem Neuladen erhalten', async () => {
  await app.page.waitForTimeout(600); // Browser-Datenbank schreibt verzögert
  await app.page.reload();
  board = seite(app.page, 'app-auftraege-page');
  await karte('Zaun reparieren').waitFor();
  assert.deepEqual(await titel('InArbeit'), ['Zaun reparieren']);
});

test('nach „Erledigt" gezogen zeigt die Karte das Erledigt-Datum', async () => {
  await zieheMitFinger(app.page, karte('Zaun reparieren'), spalte('Erledigt').locator('.karten-liste'));
  assert.deepEqual(await titel('Erledigt'), ['Zaun reparieren']);
  assert.match(await karte('Zaun reparieren').locator('.termin').textContent(), /Erledigt \d\d\.\d\d\.\d{4}/);
});

test('das Ziehen nach „Abgerechnet" bietet stattdessen die Rechnung an', async () => {
  await zieheMitFinger(app.page, karte('Zaun reparieren'), spalte('Abgerechnet').locator('.karten-liste'));
  assert.deepEqual(await titel('Abgerechnet'), []);
  assert.deepEqual(await titel('Erledigt'), ['Zaun reparieren']);
  const frage = app.page.locator('ion-alert');
  await frage.waitFor();
  assert.match(await frage.textContent(), /Rechnung erzeugen\?/);
  await frage.locator('button', { hasText: 'Abbrechen' }).click();
  await frage.waitFor({ state: 'detached' });
  assert.deepEqual(await titel('Erledigt'), ['Zaun reparieren']);
});

test('Antippen öffnet den Auftrag', async () => {
  await karte('Trockenbau Flur').tap();
  await app.page.waitForURL(/\/auftraege\/[0-9a-f-]{36}$/);
  await ruhig(app.page);
  assert.match(await seite(app.page, 'app-auftrag-detail-page').locator('ion-title').textContent(), /Trockenbau Flur/);
});

test('es sind keine Browser-Fehler aufgetreten', () => {
  assert.deepEqual(app.fehler, []);
});
