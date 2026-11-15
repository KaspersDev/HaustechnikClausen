import { testKontext } from '../../../testing/test-datenbank';
import {
  ZeiteintragDaten,
  dauerMinuten,
  formatiereDauer,
  pruefeZeiteintrag,
  stundenAufViertel,
  summeMaterialCent,
  summeMinuten,
} from '../../domain/erfassung';
import { LEERER_KUNDE } from '../../domain/kunde';
import { SqliteArtikelRepository } from './sqlite-artikel.repository';
import { SqliteAuftragRepository } from './sqlite-auftrag.repository';
import {
  SqliteMaterialeintragRepository,
  SqliteZeiteintragRepository,
} from './sqlite-erfassung.repository';
import { SqliteKundeRepository } from './sqlite-kunde.repository';

const zeit = (
  start: string,
  ende: string,
  pauseMinuten = 0,
  taetigkeit = '',
): ZeiteintragDaten => ({
  start,
  ende,
  pauseMinuten,
  taetigkeit,
});

describe('Zeit-Fachlogik', () => {
  it('berechnet die Dauer abzüglich Pause', () => {
    expect(dauerMinuten(zeit('2026-03-10T07:00:00Z', '2026-03-10T11:30:00Z'))).toBe(270);
    expect(dauerMinuten(zeit('2026-03-10T07:00:00Z', '2026-03-10T15:30:00Z', 45))).toBe(465);
  });

  it('rechnet über Mitternacht hinweg', () => {
    expect(dauerMinuten(zeit('2026-03-10T22:00:00Z', '2026-03-11T01:15:00Z'))).toBe(195);
  });

  it('lehnt ungültige Einträge ab', () => {
    expect(pruefeZeiteintrag(zeit('2026-03-10T12:00:00Z', '2026-03-10T08:00:00Z'))).toEqual([
      'Das Ende muss nach dem Start liegen.',
    ]);
    expect(pruefeZeiteintrag(zeit('2026-03-10T12:00:00Z', '2026-03-10T12:00:00Z'))).toHaveLength(1);
    expect(pruefeZeiteintrag(zeit('quatsch', '2026-03-10T12:00:00Z'))).toHaveLength(1);
    expect(
      pruefeZeiteintrag(zeit('2026-03-10T08:00:00Z', '2026-03-10T09:00:00Z', -5)),
    ).toHaveLength(1);
    expect(pruefeZeiteintrag(zeit('2026-03-10T08:00:00Z', '2026-03-10T09:00:00Z', 60))).toEqual([
      'Die Pause ist länger als die erfasste Zeit.',
    ]);
    expect(pruefeZeiteintrag(zeit('2026-03-10T08:00:00Z', '2026-03-10T09:00:00Z', 15))).toEqual([]);
  });

  it('rundet auf volle Viertelstunden auf', () => {
    expect(stundenAufViertel(0)).toBe(0);
    expect(stundenAufViertel(1)).toBe(0.25);
    expect(stundenAufViertel(15)).toBe(0.25);
    expect(stundenAufViertel(50)).toBe(1);
    expect(stundenAufViertel(60)).toBe(1);
    expect(stundenAufViertel(61)).toBe(1.25);
    expect(stundenAufViertel(270)).toBe(4.5);
  });

  it('formatiert und summiert Dauern', () => {
    expect(formatiereDauer(150)).toBe('2:30 h');
    expect(formatiereDauer(5)).toBe('0:05 h');
    expect(
      summeMinuten([
        zeit('2026-03-10T07:00:00Z', '2026-03-10T11:30:00Z'),
        zeit('2026-03-11T07:00:00Z', '2026-03-11T08:00:00Z', 15),
      ]),
    ).toBe(315);
  });

  it('summiert Material je Position gerundet', () => {
    expect(
      summeMaterialCent([
        { artikelId: 'a', menge: 12, einzelpreisCent: 895 },
        { artikelId: 'b', menge: 0.333, einzelpreisCent: 100 },
      ]),
    ).toBe(10773);
  });
});

describe('Zeit- und Materialeinträge (SQLite)', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let zeiten: SqliteZeiteintragRepository;
  let material: SqliteMaterialeintragRepository;
  let auftragId: string;
  let latteId: string;
  let anfahrtId: string;

  const abrechnen = (): Promise<number> =>
    kontext.db.run(`UPDATE auftrag SET status = 'Abgerechnet' WHERE id = ?`, [auftragId]);

  beforeEach(async () => {
    kontext = await testKontext();
    zeiten = new SqliteZeiteintragRepository(kontext);
    material = new SqliteMaterialeintragRepository(kontext);
    const kunde = await new SqliteKundeRepository(kontext).anlegen({ ...LEERER_KUNDE, name: 'M' });
    auftragId = (
      await new SqliteAuftragRepository(kontext).anlegen({
        kundeId: kunde.id,
        titel: 'Zaun',
        beschreibung: '',
        einsatzort: { strasse: '', plz: '', ort: '', land: '' },
        geplantAm: null,
      })
    ).id;
    const artikel = new SqliteArtikelRepository(kontext);
    latteId = (
      await artikel.anlegen({
        bezeichnung: 'Zaunlatte',
        einheit: 'Stk',
        nettopreisCent: 895,
        mwstSatz: 19,
        typ: 'Material',
      })
    ).id;
    anfahrtId = (
      await artikel.anlegen({
        bezeichnung: 'Anfahrt',
        einheit: 'pauschal',
        nettopreisCent: 2500,
        mwstSatz: 19,
        typ: 'Anfahrt',
      })
    ).id;
  });

  afterEach(() => kontext.db.close());

  it('legt Zeiten an und listet sie nach Start sortiert', async () => {
    await zeiten.anlegen(auftragId, zeit('2026-03-11T07:00:00.000Z', '2026-03-11T09:00:00.000Z'));
    await zeiten.anlegen(
      auftragId,
      zeit('2026-03-10T07:00:00.000Z', '2026-03-10T11:30:00.000Z', 30, ' Pfosten gesetzt '),
    );
    const liste = await zeiten.fuerAuftrag(auftragId);
    expect(liste.map((z) => z.start)).toEqual([
      '2026-03-10T07:00:00.000Z',
      '2026-03-11T07:00:00.000Z',
    ]);
    expect(liste[0]).toMatchObject({ pauseMinuten: 30, taetigkeit: 'Pfosten gesetzt', auftragId });
    expect(await zeiten.fuerAuftrag('anderer-auftrag')).toEqual([]);
  });

  it('ändert und löscht Zeiten', async () => {
    const eintrag = await zeiten.anlegen(
      auftragId,
      zeit('2026-03-10T07:00:00.000Z', '2026-03-10T09:00:00.000Z'),
    );
    await zeiten.aendern(
      eintrag.id,
      zeit('2026-03-10T07:00:00.000Z', '2026-03-10T10:00:00.000Z', 15),
    );
    expect(dauerMinuten((await zeiten.fuerAuftrag(auftragId))[0])).toBe(165);
    await zeiten.loeschen(eintrag.id);
    expect(await zeiten.fuerAuftrag(auftragId)).toEqual([]);
    await expect(zeiten.loeschen(eintrag.id)).rejects.toThrow(/nicht gefunden/);
  });

  it('lehnt ungültige Zeiten und unbekannte Aufträge ab', async () => {
    await expect(
      zeiten.anlegen(auftragId, zeit('2026-03-10T12:00:00.000Z', '2026-03-10T08:00:00.000Z')),
    ).rejects.toThrow(/Ende muss nach dem Start/);
    await expect(
      zeiten.anlegen('gibt-es-nicht', zeit('2026-03-10T07:00:00.000Z', '2026-03-10T09:00:00.000Z')),
    ).rejects.toThrow(/nicht gefunden/);
    expect(await zeiten.fuerAuftrag(auftragId)).toEqual([]);
  });

  it('legt Material an und liefert die Artikelangaben mit', async () => {
    const eintrag = await material.anlegen(auftragId, {
      artikelId: latteId,
      menge: 12,
      einzelpreisCent: 850,
    });
    expect(eintrag).toMatchObject({
      bezeichnung: 'Zaunlatte',
      einheit: 'Stk',
      typ: 'Material',
      mwstSatz: 19,
      menge: 12,
      einzelpreisCent: 850,
    });
  });

  it('nimmt Anfahrt als Eintrag mit einem Anfahrt-Artikel auf', async () => {
    await material.anlegen(auftragId, { artikelId: latteId, menge: 12, einzelpreisCent: 895 });
    await material.anlegen(auftragId, { artikelId: anfahrtId, menge: 1, einzelpreisCent: 2500 });
    const liste = await material.fuerAuftrag(auftragId);
    expect(liste.map((m) => m.typ)).toEqual(['Material', 'Anfahrt']);
    expect(summeMaterialCent(liste)).toBe(13240);
  });

  it('ändert und löscht Material', async () => {
    const eintrag = await material.anlegen(auftragId, {
      artikelId: latteId,
      menge: 12,
      einzelpreisCent: 895,
    });
    const neu = await material.aendern(eintrag.id, {
      artikelId: latteId,
      menge: 14.5,
      einzelpreisCent: 900,
    });
    expect(neu.menge).toBe(14.5);
    expect(neu.einzelpreisCent).toBe(900);
    await material.loeschen(eintrag.id);
    expect(await material.fuerAuftrag(auftragId)).toEqual([]);
  });

  it('lehnt ungültiges Material ab', async () => {
    const basis = { artikelId: latteId, menge: 1, einzelpreisCent: 895 };
    await expect(material.anlegen(auftragId, { ...basis, menge: 0 })).rejects.toThrow(/Menge/);
    await expect(material.anlegen(auftragId, { ...basis, einzelpreisCent: 8.5 })).rejects.toThrow(
      /Preis/,
    );
    await expect(material.anlegen(auftragId, { ...basis, artikelId: 'x' })).rejects.toThrow();
    expect(await material.fuerAuftrag(auftragId)).toEqual([]);
  });

  it('sperrt alle Schreibzugriffe, sobald der Auftrag abgerechnet ist', async () => {
    const z = await zeiten.anlegen(
      auftragId,
      zeit('2026-03-10T07:00:00.000Z', '2026-03-10T09:00:00.000Z'),
    );
    const m = await material.anlegen(auftragId, {
      artikelId: latteId,
      menge: 1,
      einzelpreisCent: 1,
    });
    await abrechnen();

    const gesperrt = /abgerechnet/;
    await expect(
      zeiten.anlegen(auftragId, zeit('2026-03-11T07:00:00.000Z', '2026-03-11T09:00:00.000Z')),
    ).rejects.toThrow(gesperrt);
    await expect(
      zeiten.aendern(z.id, zeit('2026-03-10T07:00:00.000Z', '2026-03-10T10:00:00.000Z')),
    ).rejects.toThrow(gesperrt);
    await expect(zeiten.loeschen(z.id)).rejects.toThrow(gesperrt);
    await expect(
      material.anlegen(auftragId, { artikelId: latteId, menge: 1, einzelpreisCent: 1 }),
    ).rejects.toThrow(gesperrt);
    await expect(
      material.aendern(m.id, { artikelId: latteId, menge: 2, einzelpreisCent: 1 }),
    ).rejects.toThrow(gesperrt);
    await expect(material.loeschen(m.id)).rejects.toThrow(gesperrt);

    expect(await zeiten.fuerAuftrag(auftragId)).toHaveLength(1);
    expect(await material.fuerAuftrag(auftragId)).toHaveLength(1);
  });
});
