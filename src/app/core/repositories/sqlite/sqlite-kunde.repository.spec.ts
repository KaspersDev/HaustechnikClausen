import { testKontext } from '../../../testing/test-datenbank';
import { KundeDaten, LEERER_KUNDE, adresszeile, kundenname } from '../../domain/kunde';
import { SqliteKundeRepository } from './sqlite-kunde.repository';

const privat = (name: string, mehr: Partial<KundeDaten> = {}): KundeDaten => ({
  ...LEERER_KUNDE,
  name,
  ...mehr,
});
const gewerbe = (firma: string, mehr: Partial<KundeDaten> = {}): KundeDaten => ({
  ...LEERER_KUNDE,
  typ: 'Gewerbe',
  firma,
  ...mehr,
});

describe('SqliteKundeRepository', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let repo: SqliteKundeRepository;

  beforeEach(async () => {
    kontext = await testKontext();
    repo = new SqliteKundeRepository(kontext);
  });

  afterEach(() => kontext.db.close());

  it('legt Kunden an und findet sie wieder', async () => {
    const kunde = await repo.anlegen(
      privat('Erika Müller', { strasse: 'Hafenweg 3', plz: '24103', ort: 'Kiel' }),
    );
    expect(kunde.id).toBe('id-1');
    expect(kunde.erstelltAm).toBe('2026-03-10T09:00:00.000Z');
    expect(await repo.finde(kunde.id)).toEqual(kunde);
    expect(await repo.finde('unbekannt')).toBeNull();
  });

  it('ändert Kunden', async () => {
    const kunde = await repo.anlegen(privat('Erika Müller'));
    const geaendert = await repo.aendern(kunde.id, privat('Erika Meier', { ort: 'Lübeck' }));
    expect(geaendert.name).toBe('Erika Meier');
    expect(geaendert.ort).toBe('Lübeck');
    expect(geaendert.erstelltAm).toBe(kunde.erstelltAm);
    await expect(repo.aendern('unbekannt', privat('X'))).rejects.toThrow(/nicht gefunden/);
  });

  it('verlangt bei Privatkunden den Namen und bei Gewerbekunden die Firma', async () => {
    await expect(repo.anlegen(privat('  '))).rejects.toThrow(/Name/);
    await expect(repo.anlegen(gewerbe(''))).rejects.toThrow(/Firma/);
    await expect(repo.anlegen(gewerbe('Bäckerei Hansen GmbH'))).resolves.toBeTruthy();
  });

  it('speichert Firma und USt-IdNr. nur bei Gewerbekunden', async () => {
    const kunde = await repo.anlegen(privat('Erika Müller', { firma: 'Irrtum', ustId: 'DE1' }));
    expect(kunde.firma).toBe('');
    expect(kunde.ustId).toBe('');
    const firma = await repo.anlegen(gewerbe('Hansen GmbH', { ustId: 'de 123456789' }));
    expect(firma.ustId).toBe('DE123456789');
  });

  it('sortiert nach Anzeigename ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute', async () => {
    await repo.anlegen(privat('Zander'));
    await repo.anlegen(gewerbe('Özdemir Bau', { name: 'Aaron' }));
    await repo.anlegen(privat('adam'));
    await repo.anlegen(privat('Ärmel'));
    expect((await repo.alle()).map(kundenname)).toEqual(['adam', 'Ärmel', 'Özdemir Bau', 'Zander']);
  });

  describe('Suche', () => {
    beforeEach(async () => {
      await repo.anlegen(
        privat('Erika Müller', {
          strasse: 'Hafenweg 3',
          plz: '24103',
          ort: 'Kiel',
          telefon: '0431 998877',
        }),
      );
      await repo.anlegen(
        gewerbe('Bäckerei Hansen GmbH', {
          name: 'Ole Hansen',
          plz: '23552',
          ort: 'Lübeck',
          email: 'ole@hansen-backt.de',
        }),
      );
      await repo.anlegen(privat('Jens Straßmann', { ort: 'Kiel' }));
    });

    const treffer = async (suche: string): Promise<string[]> =>
      (await repo.alle(suche)).map(kundenname);

    it('liefert ohne Suchtext alle Kunden', async () => {
      expect(await treffer('')).toHaveLength(3);
      expect(await treffer('   ')).toHaveLength(3);
    });

    it('findet Teiltreffer ohne Rücksicht auf Groß-/Kleinschreibung', async () => {
      expect(await treffer('mül')).toEqual(['Erika Müller']);
      expect(await treffer('HANSEN')).toEqual(['Bäckerei Hansen GmbH']);
    });

    it('findet Umlaute und ß auch in vereinfachter Schreibweise', async () => {
      expect(await treffer('muller')).toEqual(['Erika Müller']);
      expect(await treffer('MÜLLER')).toEqual(['Erika Müller']);
      expect(await treffer('backerei')).toEqual(['Bäckerei Hansen GmbH']);
      expect(await treffer('strassmann')).toEqual(['Jens Straßmann']);
      expect(await treffer('lubeck')).toEqual(['Bäckerei Hansen GmbH']);
    });

    it('sucht in Ort, PLZ, Telefon, E-Mail und Ansprechperson', async () => {
      expect(await treffer('kiel')).toEqual(['Erika Müller', 'Jens Straßmann']);
      expect(await treffer('23552')).toEqual(['Bäckerei Hansen GmbH']);
      expect(await treffer('998877')).toEqual(['Erika Müller']);
      expect(await treffer('hansen-backt')).toEqual(['Bäckerei Hansen GmbH']);
      expect(await treffer('ole')).toEqual(['Bäckerei Hansen GmbH']);
    });

    it('verlangt bei mehreren Begriffen alle', async () => {
      expect(await treffer('kiel erika')).toEqual(['Erika Müller']);
      expect(await treffer('kiel hansen')).toEqual([]);
    });
  });

  it('blendet gelöschte Kunden aus, findet sie aber noch über die ID', async () => {
    const kunde = await repo.anlegen(privat('Erika Müller'));
    await repo.loeschen(kunde.id);
    expect(await repo.alle()).toEqual([]);
    expect(await repo.alle('müller')).toEqual([]);
    expect((await repo.finde(kunde.id))?.geloeschtAm).toBe('2026-03-10T09:00:00.000Z');
    await expect(repo.aendern(kunde.id, privat('Neu'))).rejects.toThrow();
  });

  it('löscht keine Kunden mit Aufträgen', async () => {
    const kunde = await repo.anlegen(privat('Erika Müller'));
    await kontext.db.run(
      `INSERT INTO auftrag (id, nummer, kunde_id, titel, status, erstellt_am, geaendert_am)
       VALUES ('a1', 'AU-2026-0001', ?, 'Zaun', 'Offen', ?, ?)`,
      [kunde.id, kontext.jetzt(), kontext.jetzt()],
    );
    await expect(repo.loeschen(kunde.id)).rejects.toThrow(/Aufträge oder Rechnungen/);
    expect(await repo.alle()).toHaveLength(1);
  });

  it('löscht keine Kunden mit Rechnungen', async () => {
    const kunde = await repo.anlegen(privat('Erika Müller'));
    await kontext.db.run(
      `INSERT INTO rechnung (id, kunde_id, datum, faellig_am, leistungsdatum, status,
         summe_netto_cent, summe_mwst_cent, summe_brutto_cent, empf_typ, erstellt_am, geaendert_am)
       VALUES ('r1', ?, '2026-01-15', '2026-01-29', '2026-01-14', 'Entwurf', 0, 0, 0, 'Privat', ?, ?)`,
      [kunde.id, kontext.jetzt(), kontext.jetzt()],
    );
    await expect(repo.loeschen(kunde.id)).rejects.toThrow(/Aufträge oder Rechnungen/);
  });
});

describe('Kunden-Hilfsfunktionen', () => {
  it('zeigt bei Gewerbe die Firma, sonst den Namen', () => {
    expect(kundenname(gewerbe('Hansen GmbH', { name: 'Ole' }))).toBe('Hansen GmbH');
    expect(kundenname(privat('Erika Müller'))).toBe('Erika Müller');
  });

  it('baut eine Adresszeile auch aus unvollständigen Angaben', () => {
    expect(adresszeile({ strasse: 'Hafenweg 3', plz: '24103', ort: 'Kiel' })).toBe(
      'Hafenweg 3, 24103 Kiel',
    );
    expect(adresszeile({ strasse: '', plz: '', ort: 'Kiel' })).toBe('Kiel');
    expect(adresszeile({ strasse: '', plz: '', ort: '' })).toBe('');
  });
});
