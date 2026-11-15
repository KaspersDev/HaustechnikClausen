import { CapVerbindung, CapacitorTreiber } from './capacitor-treiber';
import { SerielleDatenbank } from './datenbank';

function fakeVerbindung(): CapVerbindung & { aufrufe: string[] } {
  const aufrufe: string[] = [];
  return {
    aufrufe,
    run: async (anweisung, werte, transaktion) => {
      aufrufe.push(`run:${anweisung}:${JSON.stringify(werte)}:${String(transaktion)}`);
      if (anweisung.includes('FEHLER')) {
        throw new Error('SQL-Fehler');
      }
      return { changes: { changes: 3 } };
    },
    query: async (anweisung, werte) => {
      aufrufe.push(`query:${anweisung}:${JSON.stringify(werte)}`);
      return { values: [{ a: 1 }] };
    },
    beginTransaction: async () => void aufrufe.push('begin'),
    commitTransaction: async () => void aufrufe.push('commit'),
    rollbackTransaction: async () => void aufrufe.push('rollback'),
    close: async () => void aufrufe.push('close'),
  };
}

describe('CapacitorTreiber', () => {
  it('reicht Anweisungen ohne Plugin-Transaktion durch und liefert geänderte Zeilen', async () => {
    const verbindung = fakeVerbindung();
    const treiber = new CapacitorTreiber(verbindung, async () => new Uint8Array());
    expect(await treiber.run('UPDATE t SET a = ?', [1])).toBe(3);
    expect(await treiber.query('SELECT a FROM t WHERE b = ?', ['x'])).toEqual([{ a: 1 }]);
    expect(verbindung.aufrufe).toEqual([
      'run:UPDATE t SET a = ?:[1]:false',
      'query:SELECT a FROM t WHERE b = ?:["x"]',
    ]);
  });

  it('führt Skripte Anweisung für Anweisung aus', async () => {
    const verbindung = fakeVerbindung();
    const treiber = new CapacitorTreiber(verbindung, async () => new Uint8Array());
    await treiber.execute('CREATE TABLE a (x); CREATE TABLE b (y);');
    expect(verbindung.aufrufe).toEqual([
      'run:CREATE TABLE a (x):[]:false',
      'run:CREATE TABLE b (y):[]:false',
    ]);
  });

  it('klammert Transaktionen mit begin/commit bzw. rollback', async () => {
    const verbindung = fakeVerbindung();
    const db = new SerielleDatenbank(
      new CapacitorTreiber(verbindung, async () => new Uint8Array()),
    );
    await db.transaction((tx) => tx.run('A'));
    await expect(db.transaction((tx) => tx.run('FEHLER'))).rejects.toThrow('SQL-Fehler');
    expect(verbindung.aufrufe).toEqual([
      'begin',
      'run:A:[]:false',
      'commit',
      'begin',
      'run:FEHLER:[]:false',
      'rollback',
    ]);
  });
});
