import { leereTestDatenbank, testDatenbank } from '../../testing/test-datenbank';
import { Datenbank } from './datenbank';
import { MIGRATIONEN, Migration, migriere, schemaVersion } from './migrationen';

const JETZT = '2026-01-15T10:00:00.000Z';

describe('Migrationen', () => {
  it('legt auf einer leeren Datenbank alle Tabellen an', async () => {
    const db = await leereTestDatenbank();
    expect(await schemaVersion(db)).toBe(0);
    expect(await migriere(db)).toEqual(MIGRATIONEN.map((m) => m.version));
    expect(await schemaVersion(db)).toBe(MIGRATIONEN.length);

    const tabellen = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tabellen.map((t) => t.name)).toEqual([
      'artikel',
      'auftrag',
      'einstellungen',
      'firmendaten',
      'kunde',
      'materialeintrag',
      'nummernkreis',
      'rechnung',
      'rechnungsposition',
      'zeiteintrag',
    ]);
  });

  it('tut beim erneuten Start nichts', async () => {
    const db = await testDatenbank();
    expect(await migriere(db)).toEqual([]);
    expect(await schemaVersion(db)).toBe(MIGRATIONEN.length);
  });

  it('führt nur noch nicht ausgeführte Migrationen aus', async () => {
    const m1: Migration = { version: 1, sql: 'CREATE TABLE a (x)' };
    const m2: Migration = { version: 2, sql: 'CREATE TABLE b (y)' };
    const db = await leereTestDatenbank();
    expect(await migriere(db, [m1])).toEqual([1]);
    expect(await migriere(db, [m1, m2])).toEqual([2]);
  });

  it('lässt bei einer fehlerhaften Migration den vorherigen Stand unberührt', async () => {
    const m1: Migration = { version: 1, sql: 'CREATE TABLE a (x)' };
    const kaputt: Migration = { version: 2, sql: 'CREATE TABLE b (y); CREATE TABLE a (x);' };
    const db = await leereTestDatenbank();
    await migriere(db, [m1]);
    await expect(migriere(db, [m1, kaputt])).rejects.toThrow();
    expect(await schemaVersion(db)).toBe(1);
    const tabellen = await db.query("SELECT name FROM sqlite_master WHERE name = 'b'");
    expect(tabellen).toEqual([]);
  });

  it('lehnt lückenhafte Nummerierung und neuere Datenbanken ab', async () => {
    const db = await leereTestDatenbank();
    await expect(migriere(db, [{ version: 2, sql: 'SELECT 1' }])).rejects.toThrow();
    await db.execute('PRAGMA user_version = 99');
    await expect(migriere(db)).rejects.toThrow(/neuer als diese App/);
  });
});

describe('Grundschema', () => {
  let db: Datenbank;

  const kundeAnlegen = (id = 'k1'): Promise<number> =>
    db.run(
      `INSERT INTO kunde (id, typ, name, erstellt_am, geaendert_am) VALUES (?, 'Privat', 'Meier', ?, ?)`,
      [id, JETZT, JETZT],
    );

  const rechnungAnlegen = (id = 'r1'): Promise<number> =>
    db.run(
      `INSERT INTO rechnung (id, kunde_id, datum, faellig_am, leistungsdatum, status,
         summe_netto_cent, summe_mwst_cent, summe_brutto_cent, empf_typ, erstellt_am, geaendert_am)
       VALUES (?, 'k1', '2026-01-15', '2026-01-29', '2026-01-14', 'Entwurf', 10000, 1900, 11900,
         'Privat', ?, ?)`,
      [id, JETZT, JETZT],
    );

  const positionAnlegen = (id = 'p1', rechnungId = 'r1'): Promise<number> =>
    db.run(
      `INSERT INTO rechnungsposition (id, rechnung_id, beschreibung, menge, einzelpreis_cent,
         mwst_satz, typ, position) VALUES (?, ?, 'Montage', 2, 5000, 19, 'Arbeit', 1)`,
      [id, rechnungId],
    );

  const festschreiben = (id = 'r1', nummer = 'RE-2026-0001'): Promise<number> =>
    db.run(`UPDATE rechnung SET status = 'Versendet', nummer = ? WHERE id = ?`, [nummer, id]);

  beforeEach(async () => {
    db = await testDatenbank();
    await kundeAnlegen();
  });

  afterEach(() => db.close());

  it('erzwingt Fremdschlüssel', async () => {
    await expect(
      db.run(
        `INSERT INTO auftrag (id, nummer, kunde_id, titel, status, erstellt_am, geaendert_am)
         VALUES ('a1', 'AU-2026-0001', 'gibt-es-nicht', 'Zaun', 'Offen', ?, ?)`,
        [JETZT, JETZT],
      ),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('lehnt unbekannte Enum-Werte ab', async () => {
    await expect(
      db.run(
        `INSERT INTO kunde (id, typ, erstellt_am, geaendert_am) VALUES ('k2', 'Verein', ?, ?)`,
        [JETZT, JETZT],
      ),
    ).rejects.toThrow(/CHECK/);
  });

  it('lehnt Geldbeträge ab, die keine ganzen Cent sind', async () => {
    await expect(
      db.run(
        `INSERT INTO artikel (id, bezeichnung, einheit, nettopreis_cent, mwst_satz, typ,
           erstellt_am, geaendert_am) VALUES ('x', 'Stunde', 'Std', 52.5, 19, 'Arbeit', ?, ?)`,
        [JETZT, JETZT],
      ),
    ).rejects.toThrow(/CHECK/);
  });

  it('vergibt Auftragsnummern nur einmal', async () => {
    const sql = `INSERT INTO auftrag (id, nummer, kunde_id, titel, status, erstellt_am, geaendert_am)
                 VALUES (?, 'AU-2026-0001', 'k1', 'Zaun', 'Offen', ?, ?)`;
    await db.run(sql, ['a1', JETZT, JETZT]);
    await expect(db.run(sql, ['a2', JETZT, JETZT])).rejects.toThrow(/UNIQUE/);
  });

  it('erlaubt Entwürfe nur ohne und festgeschriebene Rechnungen nur mit Nummer', async () => {
    await rechnungAnlegen();
    await expect(
      db.run(`UPDATE rechnung SET nummer = 'RE-2026-0001' WHERE id = 'r1'`),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db.run(`UPDATE rechnung SET status = 'Versendet' WHERE id = 'r1'`),
    ).rejects.toThrow(/CHECK/);
  });

  it('lässt Entwürfe ändern und löschen', async () => {
    await rechnungAnlegen();
    await positionAnlegen();
    expect(await db.run(`UPDATE rechnung SET summe_netto_cent = 5 WHERE id = 'r1'`)).toBe(1);
    expect(await db.run(`UPDATE rechnungsposition SET menge = 3 WHERE id = 'p1'`)).toBe(1);
    expect(await db.run(`DELETE FROM rechnungsposition WHERE id = 'p1'`)).toBe(1);
    expect(await db.run(`DELETE FROM rechnung WHERE id = 'r1'`)).toBe(1);
  });

  it('lässt einen Entwurf nicht direkt bezahlen oder stornieren', async () => {
    await rechnungAnlegen();
    await expect(
      db.run(`UPDATE rechnung SET status = 'Bezahlt', nummer = 'X' WHERE id = 'r1'`),
    ).rejects.toThrow(/nur festgeschrieben/);
  });

  describe('festgeschriebene Rechnung', () => {
    beforeEach(async () => {
      await rechnungAnlegen();
      await positionAnlegen();
      await festschreiben();
    });

    it.each([
      `UPDATE rechnung SET summe_brutto_cent = 1 WHERE id = 'r1'`,
      `UPDATE rechnung SET empf_name = 'Müller' WHERE id = 'r1'`,
      `UPDATE rechnung SET nummer = 'RE-2026-0002' WHERE id = 'r1'`,
      `UPDATE rechnung SET datum = '2026-02-01' WHERE id = 'r1'`,
      `UPDATE rechnung SET geloescht_am = '2026-02-01' WHERE id = 'r1'`,
      `UPDATE rechnung SET status = 'Entwurf', nummer = NULL WHERE id = 'r1'`,
      `UPDATE rechnung SET status = 'Bezahlt', summe_brutto_cent = 1 WHERE id = 'r1'`,
      `DELETE FROM rechnung WHERE id = 'r1'`,
      `UPDATE rechnungsposition SET einzelpreis_cent = 1 WHERE id = 'p1'`,
      `UPDATE rechnungsposition SET beschreibung = 'anders' WHERE id = 'p1'`,
      `DELETE FROM rechnungsposition WHERE id = 'p1'`,
    ])('weist ab: %s', async (sql) => {
      await expect(db.run(sql)).rejects.toThrow(/unveränderlich|nicht gelöscht/);
    });

    it('weist neue Positionen ab', async () => {
      await expect(positionAnlegen('p2')).rejects.toThrow(/unveränderlich/);
    });

    it('lässt keine Position aus einem Entwurf hineinverschieben', async () => {
      await rechnungAnlegen('r2');
      await positionAnlegen('p2', 'r2');
      await expect(
        db.run(`UPDATE rechnungsposition SET rechnung_id = 'r1' WHERE id = 'p2'`),
      ).rejects.toThrow(/unveränderlich/);
    });

    it('erlaubt Versendet → Bezahlt → Storniert', async () => {
      expect(
        await db.run(`UPDATE rechnung SET status = 'Bezahlt', geaendert_am = ? WHERE id = 'r1'`, [
          '2026-02-01T08:00:00.000Z',
        ]),
      ).toBe(1);
      expect(await db.run(`UPDATE rechnung SET status = 'Storniert' WHERE id = 'r1'`)).toBe(1);
    });

    it('erlaubt Versendet → Storniert, aber keinen Weg zurück', async () => {
      expect(await db.run(`UPDATE rechnung SET status = 'Storniert' WHERE id = 'r1'`)).toBe(1);
      await expect(
        db.run(`UPDATE rechnung SET status = 'Versendet' WHERE id = 'r1'`),
      ).rejects.toThrow(/unveränderlich/);
      await expect(
        db.run(`UPDATE rechnung SET status = 'Bezahlt' WHERE id = 'r1'`),
      ).rejects.toThrow(/unveränderlich/);
    });

    it('erlaubt Bezahlt nicht zurück auf Versendet', async () => {
      await db.run(`UPDATE rechnung SET status = 'Bezahlt' WHERE id = 'r1'`);
      await expect(
        db.run(`UPDATE rechnung SET status = 'Versendet' WHERE id = 'r1'`),
      ).rejects.toThrow(/unveränderlich/);
    });
  });
});
