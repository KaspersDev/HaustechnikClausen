import initSqlJs, { SqlJsStatic } from 'sql.js';
import { Datenbank, SerielleDatenbank } from '../core/db/datenbank';
import { Migration, migriere } from '../core/db/migrationen';
import { SqlJsTreiber } from '../core/db/sqljs-treiber';

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
