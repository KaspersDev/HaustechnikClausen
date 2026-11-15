import { testKontext } from '../../../testing/test-datenbank';
import { ArtikelDaten } from '../../domain/artikel';
import { STANDARD_EINSTELLUNGEN } from '../../domain/firma';
import { SqliteArtikelRepository } from './sqlite-artikel.repository';
import { SqliteEinstellungenRepository } from './sqlite-firma.repository';

const STUNDE: ArtikelDaten = {
  bezeichnung: 'Monteurstunde',
  einheit: 'Std',
  nettopreisCent: 5800,
  mwstSatz: 19,
  typ: 'Arbeit',
};
const LATTE: ArtikelDaten = {
  bezeichnung: 'Zaunlatte Lärche 180 cm',
  einheit: 'Stk',
  nettopreisCent: 895,
  mwstSatz: 19,
  typ: 'Material',
};
const ANFAHRT: ArtikelDaten = {
  bezeichnung: 'Anfahrt Stadtgebiet',
  einheit: 'pauschal',
  nettopreisCent: 2500,
  mwstSatz: 19,
  typ: 'Anfahrt',
};

describe('SqliteArtikelRepository', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let repo: SqliteArtikelRepository;

  beforeEach(async () => {
    kontext = await testKontext();
    repo = new SqliteArtikelRepository(kontext);
  });

  afterEach(() => kontext.db.close());

  it('legt Artikel an und speichert den Preis als ganze Cent', async () => {
    const artikel = await repo.anlegen(STUNDE);
    expect(await repo.finde(artikel.id)).toEqual({ ...STUNDE, id: 'id-1', geloeschtAm: null });
    const [zeile] = await kontext.db.query<{ preis: number; art: string }>(
      'SELECT nettopreis_cent AS preis, typeof(nettopreis_cent) AS art FROM artikel',
    );
    expect(zeile).toEqual({ preis: 5800, art: 'integer' });
  });

  it('ändert Artikel', async () => {
    const artikel = await repo.anlegen(STUNDE);
    const neu = await repo.aendern(artikel.id, { ...STUNDE, nettopreisCent: 6200 });
    expect(neu.nettopreisCent).toBe(6200);
    expect((await repo.finde(artikel.id))?.nettopreisCent).toBe(6200);
    await expect(repo.aendern('unbekannt', STUNDE)).rejects.toThrow(/nicht gefunden/);
  });

  it('lehnt ungültige Artikel ab', async () => {
    await expect(repo.anlegen({ ...STUNDE, bezeichnung: ' ' })).rejects.toThrow(/Bezeichnung/);
    await expect(repo.anlegen({ ...STUNDE, einheit: '' })).rejects.toThrow(/Einheit/);
    await expect(repo.anlegen({ ...STUNDE, nettopreisCent: 58.5 })).rejects.toThrow(/Preis/);
    await expect(repo.anlegen({ ...STUNDE, nettopreisCent: -1 })).rejects.toThrow(/Preis/);
    await expect(repo.anlegen({ ...STUNDE, mwstSatz: 19.5 })).rejects.toThrow(/MwSt/);
    expect(await repo.alle()).toEqual([]);
  });

  it('erlaubt einen Preis von 0,00 €', async () => {
    await expect(repo.anlegen({ ...ANFAHRT, nettopreisCent: 0 })).resolves.toBeTruthy();
  });

  it('listet sortiert und filtert nach Typ und Suche', async () => {
    await repo.anlegen(LATTE);
    await repo.anlegen(STUNDE);
    await repo.anlegen(ANFAHRT);
    const namen = async (filter?: Parameters<typeof repo.alle>[0]): Promise<string[]> =>
      (await repo.alle(filter)).map((a) => a.bezeichnung);

    expect(await namen()).toEqual([
      'Anfahrt Stadtgebiet',
      'Monteurstunde',
      'Zaunlatte Lärche 180 cm',
    ]);
    expect(await namen({ typ: 'Arbeit' })).toEqual(['Monteurstunde']);
    expect(await namen({ typ: 'Material' })).toEqual(['Zaunlatte Lärche 180 cm']);
    expect(await namen({ suche: 'larche' })).toEqual(['Zaunlatte Lärche 180 cm']);
    expect(await namen({ suche: 'STUNDE', typ: 'Material' })).toEqual([]);
    expect(await namen({ typ: null, suche: '' })).toHaveLength(3);
  });

  it('blendet gelöschte Artikel aus, lässt sie aber über die ID lesbar', async () => {
    const artikel = await repo.anlegen(LATTE);
    await repo.loeschen(artikel.id);
    expect(await repo.alle()).toEqual([]);
    expect((await repo.finde(artikel.id))?.bezeichnung).toBe(LATTE.bezeichnung);
    expect((await repo.finde(artikel.id))?.geloeschtAm).not.toBeNull();
  });

  it('lässt beim Löschen bestehende Materialeinträge unberührt', async () => {
    const artikel = await repo.anlegen(LATTE);
    const jetzt = kontext.jetzt();
    await kontext.db.run(
      `INSERT INTO kunde (id, typ, name, erstellt_am, geaendert_am) VALUES ('k1', 'Privat', 'M', ?, ?)`,
      [jetzt, jetzt],
    );
    await kontext.db.run(
      `INSERT INTO auftrag (id, nummer, kunde_id, titel, status, erstellt_am, geaendert_am)
       VALUES ('a1', 'AU-2026-0001', 'k1', 'Zaun', 'Offen', ?, ?)`,
      [jetzt, jetzt],
    );
    await kontext.db.run(
      `INSERT INTO materialeintrag (id, auftrag_id, artikel_id, menge, einzelpreis_cent,
         erstellt_am, geaendert_am) VALUES ('m1', 'a1', ?, 12, 895, ?, ?)`,
      [artikel.id, jetzt, jetzt],
    );
    await repo.loeschen(artikel.id);
    expect(await kontext.db.query('SELECT menge, einzelpreis_cent FROM materialeintrag')).toEqual([
      { menge: 12, einzelpreis_cent: 895 },
    ]);
  });

  it('entfernt einen gelöschten Artikel als Standard-Stundensatz', async () => {
    const einstellungen = new SqliteEinstellungenRepository(kontext);
    const artikel = await repo.anlegen(STUNDE);
    await einstellungen.speichern({
      ...STANDARD_EINSTELLUNGEN,
      standardStundensatzArtikelId: artikel.id,
    });
    await repo.loeschen(artikel.id);
    expect((await einstellungen.laden()).standardStundensatzArtikelId).toBeNull();
  });
});
