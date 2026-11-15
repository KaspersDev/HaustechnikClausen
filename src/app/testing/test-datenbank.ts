import initSqlJs, { SqlJsStatic } from 'sql.js';
import { Datenbank, SerielleDatenbank } from '../core/db/datenbank';
import { Migration, migriere } from '../core/db/migrationen';
import { SqlJsTreiber } from '../core/db/sqljs-treiber';
import { RepoKontext } from '../core/repositories/sqlite/kontext';

let sqlJs: Promise<SqlJsStatic> | null = null;

/** Leere In-Memory-SQLite ohne Schema. */
export async function leereTestDatenbank(inhalt?: Uint8Array): Promise<Datenbank> {
  sqlJs ??= initSqlJs();
  return new SerielleDatenbank(await SqlJsTreiber.oeffnen(await sqlJs, inhalt));
}

/** In-Memory-SQLite mit vollständig migriertem Schema. */
export async function testDatenbank(migrationen?: readonly Migration[]): Promise<Datenbank> {
  const db = await leereTestDatenbank();
  await migriere(db, migrationen);
  return db;
}

/**
 * Repository-Kontext auf einer frischen Test-Datenbank mit fester Uhr und
 * vorhersagbaren IDs („id-1", „id-2", …). Die Uhr lässt sich über `uhr.zeit` stellen.
 */
export async function testKontext(): Promise<RepoKontext & { uhr: { zeit: string } }> {
  const db = await testDatenbank();
  const uhr = { zeit: '2026-03-10T09:00:00.000Z' };
  let zaehler = 0;
  return { db, uhr, jetzt: () => uhr.zeit, neueId: () => `id-${++zaehler}` };
}
