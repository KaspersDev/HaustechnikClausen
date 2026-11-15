import { TestBed } from '@angular/core/testing';
import { STANDARD_EINSTELLUNGEN } from '../domain/firma';
import { positionenAusAuftrag } from '../domain/rechnung-aus-auftrag';
import { AUFTRAG_REPOSITORY } from '../repositories/auftrag.repository';
import { EINSTELLUNGEN_REPOSITORY } from '../repositories/firma.repository';
import { RECHNUNG_REPOSITORY, RechnungRepository } from '../repositories/rechnung.repository';
import {
  Grunddaten,
  erfasseLeistungen,
  legeAuftragAn,
  legeGrunddatenAn,
} from '../../testing/fixtures';
import { testKontext } from '../../testing/test-datenbank';
import { provideTestUmgebung } from '../../testing/test-providers';
import { RechnungAusAuftragService } from './rechnung-aus-auftrag.service';

describe('RechnungAusAuftragService', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let service: RechnungAusAuftragService;
  let rechnungen: RechnungRepository;
  let daten: Grunddaten;
  let auftragId: string;

  const erzeuge = async (): ReturnType<RechnungRepository['finde']> =>
    rechnungen.finde((await service.erzeuge(auftragId)).id);

  beforeEach(async () => {
    kontext = await testKontext();
    TestBed.configureTestingModule({ providers: [provideTestUmgebung(kontext)] });
    service = TestBed.inject(RechnungAusAuftragService);
    rechnungen = TestBed.inject(RECHNUNG_REPOSITORY);
    daten = await legeGrunddatenAn(kontext);
    kontext.uhr.zeit = '2026-03-10T15:00:00.000Z';
    auftragId = (await legeAuftragAn(kontext, daten.kunde.id, 'Zaun reparieren', false)).id;
  });

  afterEach(() => kontext.db.close());

  const erledige = async (): Promise<void> => {
    await TestBed.inject(AUFTRAG_REPOSITORY).verschiebe(auftragId, 'Erledigt');
  };

  it('übernimmt Kunde, Zeiten, Material und Anfahrt als Entwurf', async () => {
    await erfasseLeistungen(kontext, auftragId, daten);
    await erledige();
    kontext.uhr.zeit = '2026-03-12T09:00:00.000Z';
    const r = await erzeuge();

    expect(r?.status).toBe('Entwurf');
    expect(r?.nummer).toBeNull();
    expect(r?.kundeId).toBe(daten.kunde.id);
    expect(r?.auftragId).toBe(auftragId);
    expect(
      r?.positionen.map((p) => [p.typ, p.beschreibung, p.menge, p.einheit, p.einzelpreisCent]),
    ).toEqual([
      ['Arbeit', 'Zaun gesetzt', 5.75, 'Std', 5800],
      ['Material', 'Zaunlatte Lärche 180 cm', 12, 'Stk', 895],
      ['Anfahrt', 'Anfahrt Stadtgebiet', 1, 'pauschal', 2500],
    ]);
    // 5,75 × 58,00 + 107,40 + 25,00 = 465,90
    expect(r?.summeNettoCent).toBe(46590);
  });

  it('setzt Rechnungsdatum, Leistungsdatum und Fälligkeit', async () => {
    await erledige(); // erledigt am 10.03.
    kontext.uhr.zeit = '2026-03-12T09:00:00.000Z';
    const r = await erzeuge();
    expect(r?.datum).toBe('2026-03-12');
    expect(r?.leistungsdatum).toBe('2026-03-10');
    expect(r?.faelligAm).toBe('2026-03-26');
  });

  it('verwendet das eingestellte Zahlungsziel', async () => {
    const einstellungen = TestBed.inject(EINSTELLUNGEN_REPOSITORY);
    await einstellungen.speichern({ ...(await einstellungen.laden()), zahlungszielTage: 30 });
    await erledige();
    expect((await erzeuge())?.faelligAm).toBe('2026-04-09');
  });

  it('legt für einen Auftrag ohne Einträge einen leeren Entwurf an', async () => {
    await erledige();
    const r = await erzeuge();
    expect(r?.positionen).toEqual([]);
    expect(r?.summeBruttoCent).toBe(0);
  });

  it('rechnet nur erledigte Aufträge ab', async () => {
    await expect(service.erzeuge(auftragId)).rejects.toThrow(/Nur erledigte Aufträge/);
    await expect(service.erzeuge('gibt-es-nicht')).rejects.toThrow(/nicht gefunden/);
    expect(await rechnungen.alle()).toEqual([]);
  });

  it('liefert einen vorhandenen Entwurf, statt einen zweiten anzulegen', async () => {
    await erledige();
    const erster = await service.erzeuge(auftragId);
    const zweiter = await service.erzeuge(auftragId);
    expect(zweiter.id).toBe(erster.id);
    expect(await rechnungen.alle()).toHaveLength(1);
  });

  it('lehnt bereits abgerechnete Aufträge mit Nennung der Rechnung ab', async () => {
    await erfasseLeistungen(kontext, auftragId, daten);
    await erledige();
    await rechnungen.festschreiben((await service.erzeuge(auftragId)).id);
    await expect(service.erzeuge(auftragId)).rejects.toThrow(
      /bereits mit RE-2026-0001 abgerechnet/,
    );
  });

  it('meldet einen fehlenden Stundensatz verständlich', async () => {
    await erfasseLeistungen(kontext, auftragId, daten);
    await erledige();
    await TestBed.inject(EINSTELLUNGEN_REPOSITORY).speichern(STANDARD_EINSTELLUNGEN);
    await expect(service.erzeuge(auftragId)).rejects.toThrow(/Standard-Stundensatz/);
    expect(await rechnungen.alle()).toEqual([]);
  });
});

describe('positionenAusAuftrag', () => {
  const stunde = {
    id: 's',
    bezeichnung: 'Monteurstunde',
    einheit: 'Std',
    nettopreisCent: 5800,
    mwstSatz: 19,
    typ: 'Arbeit' as const,
    geloeschtAm: null,
  };
  const zeit = (start: string, ende: string, taetigkeit: string, pauseMinuten = 0) => ({
    id: start,
    auftragId: 'a',
    start: `2026-03-10T${start}:00.000Z`,
    ende: `2026-03-10T${ende}:00.000Z`,
    pauseMinuten,
    taetigkeit,
  });

  it('fasst Zeiten je Tätigkeit zusammen und rundet die Summe auf Viertelstunden auf', () => {
    const positionen = positionenAusAuftrag(
      [
        zeit('07:00', '08:10', 'Abbau'), // 70
        zeit('08:10', '10:00', 'Montage'), // 110
        zeit('13:00', '13:20', 'Abbau'), // 20  → 90 min = 1,5 h
        zeit('14:00', '14:05', ' '), // 5 → 0,25 h
      ],
      [],
      stunde,
    );
    expect(positionen.map((p) => [p.beschreibung, p.menge])).toEqual([
      ['Abbau', 1.5],
      ['Montage', 2],
      ['Arbeitszeit', 0.25],
    ]);
    expect(positionen.every((p) => p.typ === 'Arbeit' && p.einzelpreisCent === 5800)).toBe(true);
  });

  it('rundet erst die Summe, nicht jeden Eintrag einzeln', () => {
    const [p] = positionenAusAuftrag(
      [zeit('07:00', '07:10', 'X'), zeit('08:00', '08:10', 'X'), zeit('09:00', '09:10', 'X')],
      [],
      stunde,
    );
    expect(p.menge).toBe(0.5);
  });

  it('ordnet Arbeit vor Material vor Anfahrt und übernimmt den Typ vom Artikel', () => {
    const eintrag = (typ: 'Arbeit' | 'Material' | 'Anfahrt', bezeichnung: string) => ({
      id: bezeichnung,
      auftragId: 'a',
      artikelId: bezeichnung,
      menge: 1,
      einzelpreisCent: 100,
      bezeichnung,
      einheit: 'Stk',
      mwstSatz: 7,
      typ,
    });
    const positionen = positionenAusAuftrag(
      [zeit('07:00', '08:00', 'Montage')],
      [
        eintrag('Anfahrt', 'Anfahrt'),
        eintrag('Material', 'Latte'),
        eintrag('Material', 'Schraube'),
      ],
      stunde,
    );
    expect(positionen.map((p) => p.beschreibung)).toEqual([
      'Montage',
      'Latte',
      'Schraube',
      'Anfahrt',
    ]);
    expect(positionen[1].mwstSatz).toBe(7);
  });

  it('braucht ohne Zeiten keinen Stundensatz', () => {
    expect(positionenAusAuftrag([], [], null)).toEqual([]);
    expect(() => positionenAusAuftrag([zeit('07:00', '08:00', 'X')], [], null)).toThrow(
      /Standard-Stundensatz/,
    );
  });
});
