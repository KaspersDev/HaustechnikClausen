import initSqlJs, { SqlJsStatic } from 'sql.js';
import {
  entwurfsdaten,
  erfasseLeistungen,
  legeAuftragAn,
  legeGrunddatenAn,
} from '../../testing/fixtures';
import { leereTestDatenbank, testDatenbank, testKontext } from '../../testing/test-datenbank';
import { SqliteKundeRepository } from '../repositories/sqlite/sqlite-kunde.repository';
import { SqliteRechnungRepository } from '../repositories/sqlite/sqlite-rechnung.repository';
import { Datenbank } from './datenbank';
import { exportiereDaten, importiereDaten } from './datensicherung';
import { MIGRATIONEN, migriere, schemaVersion } from './migrationen';

async function bestand(db: Datenbank): Promise<Record<string, unknown[]>> {
  const tabellen = await db.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );
  const inhalt: Record<string, unknown[]> = {};
  for (const { name } of tabellen) {
    inhalt[name] = await db.query(`SELECT * FROM "${name}" ORDER BY 1, 2`);
  }
  return inhalt;
}

describe('Datensicherung', () => {
  let sqlJs: SqlJsStatic;
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let rechnungId: string;

  beforeAll(async () => {
    sqlJs = await initSqlJs();
  });

  beforeEach(async () => {
    kontext = await testKontext();
    const daten = await legeGrunddatenAn(kontext);
    const auftrag = await legeAuftragAn(kontext, daten.kunde.id, 'Zaun reparieren', false);
    await erfasseLeistungen(kontext, auftrag.id, daten);
    await kontext.db.run(`UPDATE auftrag SET status = 'Erledigt' WHERE id = ?`, [auftrag.id]);
    const rechnungen = new SqliteRechnungRepository(kontext);
    rechnungId = (
      await rechnungen.festschreiben(
        (await rechnungen.entwurfAnlegen(entwurfsdaten(daten.kunde.id, auftrag.id))).id,
      )
    ).id;
    await rechnungen.entwurfAnlegen(entwurfsdaten(daten.gewerbekunde.id, null));
  });

  afterEach(() => kontext.db.close());

  it('Export und Import ergeben einen identischen Datenbestand', async () => {
    const datei = await exportiereDaten(kontext.db, sqlJs);
    const neu = await testDatenbank();
    await importiereDaten(neu, datei, sqlJs);

    const vorher = await bestand(kontext.db);
    expect(await bestand(neu)).toEqual(vorher);
    expect(vorher['rechnung']).toHaveLength(2);
    expect(vorher['rechnungsposition']).toHaveLength(6);
    expect(vorher['zeiteintrag']).toHaveLength(2);
    expect(await schemaVersion(neu)).toBe(MIGRATIONEN.length);
    await neu.close();
  });

  it('die exportierte Datei ist eine eigenständige SQLite-Datenbank', async () => {
    const datei = await exportiereDaten(kontext.db, sqlJs);
    expect(new TextDecoder().decode(datei.slice(0, 15))).toBe('SQLite format 3');
    const kopie = await leereTestDatenbank(datei);
    expect(await kopie.query('SELECT name FROM kunde ORDER BY name')).toEqual([
      { name: 'Erika Müller' },
      { name: 'Ole Hansen' },
    ]);
    await kopie.close();
  });

  it('der Import ersetzt den vorhandenen Bestand vollständig', async () => {
    const datei = await exportiereDaten(kontext.db, sqlJs);
    const anderer = await testKontext();
    await new SqliteKundeRepository(anderer).anlegen({
      typ: 'Privat',
      firma: '',
      name: 'Wird ersetzt',
      strasse: '',
      plz: '',
      ort: '',
      land: '',
      email: '',
      telefon: '',
      ustId: '',
    });
    await importiereDaten(anderer.db, datei, sqlJs);
    expect(await bestand(anderer.db)).toEqual(await bestand(kontext.db));
    await anderer.db.close();
  });

  it('festgeschriebene Rechnungen bleiben nach dem Import unveränderlich', async () => {
    const neu = await testDatenbank();
    await importiereDaten(neu, await exportiereDaten(kontext.db, sqlJs), sqlJs);
    await expect(
      neu.run('UPDATE rechnung SET summe_brutto_cent = 1 WHERE id = ?', [rechnungId]),
    ).rejects.toThrow(/unveränderlich/);
    await expect(
      neu.run('DELETE FROM rechnungsposition WHERE rechnung_id = ?', [rechnungId]),
    ).rejects.toThrow(/unveränderlich/);
    await neu.close();
  });

  it('die Nummernkreise laufen nach dem Import lückenlos weiter', async () => {
    const neu = await testKontext();
    await importiereDaten(neu.db, await exportiereDaten(kontext.db, sqlJs), sqlJs);
    const rechnungen = new SqliteRechnungRepository(neu);
    const [entwurf] = await rechnungen.alle({ status: 'Entwurf' });
    expect((await rechnungen.festschreiben(entwurf.id)).nummer).toBe('RE-2026-0002');
    await neu.db.close();
  });

  it('lehnt fremde Dateien ab und lässt den Bestand unverändert', async () => {
    const vorher = await bestand(kontext.db);
    const meldung = /keine Datensicherung dieser App/;
    await expect(
      importiereDaten(kontext.db, new TextEncoder().encode('Das ist ein PDF'), sqlJs),
    ).rejects.toThrow(meldung);
    await expect(importiereDaten(kontext.db, new Uint8Array(), sqlJs)).rejects.toThrow(meldung);

    const fremd = await leereTestDatenbank();
    await fremd.execute('CREATE TABLE etwas (x)');
    await expect(importiereDaten(kontext.db, await fremd.exportieren(), sqlJs)).rejects.toThrow(
      meldung,
    );
    expect(await bestand(kontext.db)).toEqual(vorher);
    await fremd.close();
  });

  it('lehnt Sicherungen einer neueren App-Version ab', async () => {
    const neuer = await testDatenbank();
    await neuer.execute('PRAGMA user_version = 99');
    await expect(importiereDaten(kontext.db, await neuer.exportieren(), sqlJs)).rejects.toThrow(
      /neuer als diese App/,
    );
    await neuer.close();
  });

  it('bringt eine Sicherung mit älterem Schema beim Import auf den aktuellen Stand', async () => {
    const naechste = {
      version: MIGRATIONEN.length + 1,
      sql: `ALTER TABLE kunde ADD COLUMN notiz TEXT NOT NULL DEFAULT 'neu'`,
    };
    const alteSicherung = await exportiereDaten(kontext.db, sqlJs);

    const ziel = await leereTestDatenbank();
    await migriere(ziel, [...MIGRATIONEN, naechste]);
    await importiereDaten(ziel, alteSicherung, sqlJs, [...MIGRATIONEN, naechste]);
    expect(await ziel.query('SELECT name, notiz FROM kunde ORDER BY name')).toEqual([
      { name: 'Erika Müller', notiz: 'neu' },
      { name: 'Ole Hansen', notiz: 'neu' },
    ]);
    await ziel.close();
  });
});
