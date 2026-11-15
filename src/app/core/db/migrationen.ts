import { Datenbank } from './datenbank';
import { MIGRATION_001 } from './migrationen/001-grundschema';

export interface Migration {
  /** Fortlaufend ab 1; entspricht `PRAGMA user_version` nach der Ausführung. */
  readonly version: number;
  readonly sql: string;
}

/** Ausgelieferte Migrationen werden nie geändert – nur neue angehängt. */
export const MIGRATIONEN: readonly Migration[] = [MIGRATION_001];

export async function schemaVersion(db: Datenbank): Promise<number> {
  const zeilen = await db.query<{ user_version: number }>('PRAGMA user_version');
  return zeilen[0]?.user_version ?? 0;
}

/**
 * Bringt die Datenbank auf den neuesten Stand. Jede Migration läuft in einer eigenen
 * Transaktion; schlägt sie fehl, bleibt der vorherige Stand erhalten.
 * Liefert die Versionen der ausgeführten Migrationen.
 */
export async function migriere(
  db: Datenbank,
  migrationen: readonly Migration[] = MIGRATIONEN,
): Promise<number[]> {
  migrationen.forEach((m, index) => {
    if (m.version !== index + 1) {
      throw new Error(`Migrationen müssen lückenlos ab 1 nummeriert sein (gefunden: ${m.version})`);
    }
  });

  const aktuell = await schemaVersion(db);
  if (aktuell > migrationen.length) {
    throw new Error(
      `Die Datenbank (Version ${aktuell}) ist neuer als diese App (Version ${migrationen.length}).`,
    );
  }

  const ausgefuehrt: number[] = [];
  for (const migration of migrationen.slice(aktuell)) {
    await db.transaction(async (tx) => {
      await tx.execute(migration.sql);
      await tx.execute(`PRAGMA user_version = ${migration.version}`);
    });
    ausgefuehrt.push(migration.version);
  }
  return ausgefuehrt;
}
