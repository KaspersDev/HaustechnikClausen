import { testKontext } from '../../../testing/test-datenbank';
import { AuftragDaten, istStatuswechselErlaubt } from '../../domain/auftrag';
import { LEERER_KUNDE } from '../../domain/kunde';
import { SqliteAuftragRepository } from './sqlite-auftrag.repository';
import { SqliteKundeRepository } from './sqlite-kunde.repository';

describe('SqliteAuftragRepository', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let repo: SqliteAuftragRepository;
  let kundeId: string;

  const daten = (titel: string, mehr: Partial<AuftragDaten> = {}): AuftragDaten => ({
    kundeId,
    titel,
    beschreibung: '',
    einsatzort: { strasse: 'Hafenweg 3', plz: '24103', ort: 'Kiel', land: 'Deutschland' },
    geplantAm: null,
    ...mehr,
  });

  const spalte = async (status: string): Promise<string[]> =>
    (await repo.alle()).filter((a) => a.status === status).map((a) => a.titel);

  beforeEach(async () => {
    kontext = await testKontext();
    repo = new SqliteAuftragRepository(kontext);
    const kunden = new SqliteKundeRepository(kontext);
    kundeId = (await kunden.anlegen({ ...LEERER_KUNDE, name: 'Erika Müller', ort: 'Kiel' })).id;
  });

  afterEach(() => kontext.db.close());

  it('vergibt beim Anlegen fortlaufende Nummern und beginnt in „Offen"', async () => {
    const a = await repo.anlegen(daten('Zaun reparieren', { geplantAm: '2026-03-20' }));
    const b = await repo.anlegen(daten('Trockenbau Flur'));
    expect(a.nummer).toBe('AU-2026-0001');
    expect(b.nummer).toBe('AU-2026-0002');
    expect(a.status).toBe('Offen');
    expect(a.erledigtAm).toBeNull();
    expect(a.rechnungId).toBeNull();
    expect([a.sortierung, b.sortierung]).toEqual([0, 1]);
    expect((await repo.finde(a.id))?.geplantAm).toBe('2026-03-20');
  });

  it('nimmt das Jahr der Nummer aus dem Anlagedatum', async () => {
    kontext.uhr.zeit = '2027-01-05T08:00:00.000Z';
    expect((await repo.anlegen(daten('Neujahr'))).nummer).toBe('AU-2027-0001');
  });

  it('verbraucht keine Nummer, wenn das Anlegen scheitert', async () => {
    await expect(repo.anlegen(daten('Zaun', { kundeId: 'gibt-es-nicht' }))).rejects.toThrow();
    await expect(repo.anlegen(daten('  '))).rejects.toThrow(/Titel/);
    expect((await repo.anlegen(daten('Zaun'))).nummer).toBe('AU-2026-0001');
  });

  it('liefert Aufträge mit Kundennamen und durchsucht Nummer, Titel, Kunde und Ort', async () => {
    await repo.anlegen(daten('Zaun reparieren'));
    await repo.anlegen(
      daten('Trockenbau Flur', {
        einsatzort: { strasse: 'Am Markt 1', plz: '23552', ort: 'Lübeck', land: 'Deutschland' },
      }),
    );
    expect((await repo.alle())[0].kundeName).toBe('Erika Müller');
    expect((await repo.alle('lubeck')).map((a) => a.titel)).toEqual(['Trockenbau Flur']);
    expect((await repo.alle('0001')).map((a) => a.titel)).toEqual(['Zaun reparieren']);
    expect(await repo.alle('muller')).toHaveLength(2);
    expect(await repo.alle('dach')).toEqual([]);
  });

  it('ändert Auftragsdaten, aber weder Nummer noch Status', async () => {
    const a = await repo.anlegen(daten('Zaun'));
    const neu = await repo.aendern(a.id, daten('Zaun und Tor', { beschreibung: '12 m' }));
    expect(neu.titel).toBe('Zaun und Tor');
    expect(neu.beschreibung).toBe('12 m');
    expect(neu.nummer).toBe(a.nummer);
    expect(neu.status).toBe('Offen');
    await expect(repo.aendern('unbekannt', daten('X'))).rejects.toThrow(/nicht gefunden/);
  });

  describe('Statuswechsel', () => {
    it('erlaubt freie Wechsel zwischen Offen, In Arbeit und Erledigt', () => {
      for (const von of ['Offen', 'InArbeit', 'Erledigt'] as const) {
        for (const nach of ['Offen', 'InArbeit', 'Erledigt'] as const) {
          expect(istStatuswechselErlaubt(von, nach)).toBe(true);
        }
      }
    });

    it('verbietet jeden manuellen Wechsel nach und von „Abgerechnet"', () => {
      for (const status of ['Offen', 'InArbeit', 'Erledigt', 'Abgerechnet'] as const) {
        expect(istStatuswechselErlaubt(status, 'Abgerechnet')).toBe(false);
        expect(istStatuswechselErlaubt('Abgerechnet', status)).toBe(false);
      }
    });

    it('setzt erledigtAm bei „Erledigt" und löscht es beim Zurückschieben', async () => {
      const a = await repo.anlegen(daten('Zaun'));
      kontext.uhr.zeit = '2026-03-12T15:30:00.000Z';
      const erledigt = await repo.verschiebe(a.id, 'Erledigt');
      expect(erledigt.status).toBe('Erledigt');
      expect(erledigt.erledigtAm).toBe('2026-03-12T15:30:00.000Z');

      const zurueck = await repo.verschiebe(a.id, 'InArbeit');
      expect(zurueck.status).toBe('InArbeit');
      expect(zurueck.erledigtAm).toBeNull();
    });

    it('behält erledigtAm beim Umsortieren innerhalb von „Erledigt"', async () => {
      const a = await repo.anlegen(daten('Zaun'));
      await repo.anlegen(daten('Tor'));
      kontext.uhr.zeit = '2026-03-12T15:30:00.000Z';
      await repo.verschiebe(a.id, 'Erledigt');
      kontext.uhr.zeit = '2026-03-14T08:00:00.000Z';
      expect((await repo.verschiebe(a.id, 'Erledigt', 0)).erledigtAm).toBe(
        '2026-03-12T15:30:00.000Z',
      );
    });

    it('lässt „Abgerechnet" nicht manuell setzen', async () => {
      const a = await repo.anlegen(daten('Zaun'));
      await repo.verschiebe(a.id, 'Erledigt');
      await expect(repo.verschiebe(a.id, 'Abgerechnet')).rejects.toThrow(/Festschreiben/);
      expect((await repo.finde(a.id))?.status).toBe('Erledigt');
    });

    it('fixiert abgerechnete Aufträge', async () => {
      const a = await repo.anlegen(daten('Zaun'));
      await kontext.db.run(`UPDATE auftrag SET status = 'Abgerechnet' WHERE id = ?`, [a.id]);
      await expect(repo.verschiebe(a.id, 'Offen')).rejects.toThrow(/nicht mehr verschoben/);
      await expect(repo.verschiebe(a.id, 'Abgerechnet', 0)).rejects.toThrow(
        /nicht mehr verschoben/,
      );
      await expect(repo.aendern(a.id, daten('Neu'))).rejects.toThrow(/nicht mehr geändert/);
    });
  });

  describe('Reihenfolge', () => {
    let ids: Record<string, string>;

    beforeEach(async () => {
      ids = {};
      for (const titel of ['A', 'B', 'C', 'D']) {
        ids[titel] = (await repo.anlegen(daten(titel))).id;
      }
    });

    it('hängt neue Aufträge unten an', async () => {
      expect(await spalte('Offen')).toEqual(['A', 'B', 'C', 'D']);
    });

    it('sortiert innerhalb einer Spalte um', async () => {
      await repo.verschiebe(ids['D'], 'Offen', 0);
      expect(await spalte('Offen')).toEqual(['D', 'A', 'B', 'C']);
      await repo.verschiebe(ids['D'], 'Offen', 2);
      expect(await spalte('Offen')).toEqual(['A', 'B', 'D', 'C']);
    });

    it('fügt beim Spaltenwechsel an der gewünschten Stelle ein', async () => {
      await repo.verschiebe(ids['A'], 'InArbeit');
      await repo.verschiebe(ids['B'], 'InArbeit');
      await repo.verschiebe(ids['C'], 'InArbeit', 1);
      expect(await spalte('InArbeit')).toEqual(['A', 'C', 'B']);
      expect(await spalte('Offen')).toEqual(['D']);
    });

    it('begrenzt die Position auf die Spaltenlänge', async () => {
      await repo.verschiebe(ids['A'], 'InArbeit', 99);
      await repo.verschiebe(ids['B'], 'InArbeit', -5);
      expect(await spalte('InArbeit')).toEqual(['B', 'A']);
    });

    it('behält die Reihenfolge dauerhaft', async () => {
      await repo.verschiebe(ids['C'], 'Offen', 0);
      const neu = new SqliteAuftragRepository(kontext);
      expect((await neu.alle()).map((a) => a.titel)).toEqual(['C', 'A', 'B', 'D']);
    });
  });
});
