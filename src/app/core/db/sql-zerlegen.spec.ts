import { leereTestDatenbank } from '../../testing/test-datenbank';
import { MIGRATIONEN } from './migrationen';
import { zerlegeSql } from './sql-zerlegen';

describe('zerlegeSql', () => {
  it('trennt Anweisungen an Semikolons', () => {
    expect(zerlegeSql('CREATE TABLE a (x); CREATE TABLE b (y);')).toEqual([
      'CREATE TABLE a (x)',
      'CREATE TABLE b (y)',
    ]);
  });

  it('ignoriert Kommentare und leere Anweisungen', () => {
    expect(zerlegeSql('-- Kommentar; mit Semikolon\nSELECT 1;;\n  ')).toEqual(['SELECT 1']);
  });

  it('lässt Semikolons in Zeichenketten stehen', () => {
    expect(zerlegeSql("INSERT INTO t VALUES ('a;b', 'it''s; ok'); SELECT 2")).toEqual([
      "INSERT INTO t VALUES ('a;b', 'it''s; ok')",
      'SELECT 2',
    ]);
  });

  it('hält Trigger-Rümpfe zusammen', () => {
    const teile = zerlegeSql(`
      CREATE TRIGGER tr BEFORE DELETE ON t BEGIN
        SELECT RAISE(ABORT, 'nein; wirklich');
        SELECT 1;
      END;
      SELECT 3;`);
    expect(teile).toHaveLength(2);
    expect(teile[0]).toMatch(/^CREATE TRIGGER[\s\S]*END$/);
    expect(teile[1]).toBe('SELECT 3');
  });

  it('ergibt für alle Migrationen dasselbe Schema wie die Ausführung am Stück', async () => {
    const amStueck = await leereTestDatenbank();
    const einzeln = await leereTestDatenbank();
    for (const migration of MIGRATIONEN) {
      await amStueck.execute(migration.sql);
      for (const anweisung of zerlegeSql(migration.sql)) {
        await einzeln.run(anweisung);
      }
    }
    const schema = 'SELECT type, name, sql FROM sqlite_master ORDER BY type, name';
    const erwartet = await amStueck.query<{ name: string }>(schema);
    expect(erwartet.length).toBeGreaterThan(10);
    expect((await einzeln.query<{ name: string }>(schema)).map((z) => z.name)).toEqual(
      erwartet.map((z) => z.name),
    );
  });
});
