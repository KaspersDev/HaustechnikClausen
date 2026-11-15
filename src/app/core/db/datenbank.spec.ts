import { leereTestDatenbank } from '../../testing/test-datenbank';
import { Datenbank } from './datenbank';

describe('Datenbank (sql.js)', () => {
  let db: Datenbank;

  beforeEach(async () => {
    db = await leereTestDatenbank();
    await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, wert TEXT NOT NULL)');
  });

  afterEach(() => db.close());

  it('führt Anweisungen mit Parametern aus und meldet geänderte Zeilen', async () => {
    expect(await db.run('INSERT INTO t (wert) VALUES (?)', ['a'])).toBe(1);
    await db.run('INSERT INTO t (wert) VALUES (?)', ['b']);
    expect(await db.run('UPDATE t SET wert = ?', ['c'])).toBe(2);
    expect(await db.query('SELECT id, wert FROM t ORDER BY id')).toEqual([
      { id: 1, wert: 'c' },
      { id: 2, wert: 'c' },
    ]);
  });

  it('schreibt eine Transaktion vollständig fest', async () => {
    const ergebnis = await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t (wert) VALUES (?)', ['a']);
      await tx.run('INSERT INTO t (wert) VALUES (?)', ['b']);
      return 'fertig';
    });
    expect(ergebnis).toBe('fertig');
    expect(await db.query('SELECT wert FROM t')).toHaveLength(2);
  });

  it('rollt eine Transaktion bei einem Fehler vollständig zurück', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO t (wert) VALUES (?)', ['a']);
        throw new Error('Abbruch');
      }),
    ).rejects.toThrow('Abbruch');
    expect(await db.query('SELECT wert FROM t')).toEqual([]);
  });

  it('rollt auch bei einem SQL-Fehler zurück und bleibt danach benutzbar', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO t (wert) VALUES (?)', ['a']);
        await tx.run('INSERT INTO t (wert) VALUES (?)', [null]);
      }),
    ).rejects.toThrow();
    expect(await db.query('SELECT wert FROM t')).toEqual([]);
    await db.run('INSERT INTO t (wert) VALUES (?)', ['b']);
    expect(await db.query('SELECT wert FROM t')).toEqual([{ wert: 'b' }]);
  });

  it('lässt parallele Transaktionen nacheinander laufen', async () => {
    const protokoll: string[] = [];
    const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));
    const eins = db.transaction(async (tx) => {
      protokoll.push('1 start');
      await pause();
      await tx.run('INSERT INTO t (wert) VALUES (?)', ['1']);
      protokoll.push('1 ende');
    });
    const zwei = db.transaction(async (tx) => {
      protokoll.push('2 start');
      await tx.run('INSERT INTO t (wert) VALUES (?)', ['2']);
      protokoll.push('2 ende');
    });
    const lesen = db.query('SELECT wert FROM t');
    await Promise.all([eins, zwei]);
    expect(protokoll).toEqual(['1 start', '1 ende', '2 start', '2 ende']);
    expect(await lesen).toHaveLength(2);
  });

  it('exportiert den Inhalt als SQLite-Datei, die sich wieder öffnen lässt', async () => {
    await db.run('INSERT INTO t (wert) VALUES (?)', ['a']);
    const kopie = await leereTestDatenbank(await db.exportieren());
    expect(await kopie.query('SELECT wert FROM t')).toEqual([{ wert: 'a' }]);
    await kopie.close();
  });
});
