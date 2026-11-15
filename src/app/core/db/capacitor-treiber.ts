import { DbTreiber, SqlWert, SqlZeile } from './datenbank';
import { zerlegeSql } from './sql-zerlegen';

/** Der von der App benötigte Ausschnitt einer `SQLiteDBConnection` des Capacitor-Plugins. */
export interface CapVerbindung {
  run(
    anweisung: string,
    werte?: unknown[],
    transaktion?: boolean,
  ): Promise<{ changes?: { changes?: number } }>;
  query(anweisung: string, werte?: unknown[]): Promise<{ values?: unknown[] }>;
  beginTransaction(): Promise<unknown>;
  commitTransaction(): Promise<unknown>;
  rollbackTransaction(): Promise<unknown>;
  close(): Promise<void>;
}

/** SQLite auf dem Gerät über `@capacitor-community/sqlite`. */
export class CapacitorTreiber implements DbTreiber {
  constructor(
    private readonly verbindung: CapVerbindung,
    private readonly dateiLesen: () => Promise<Uint8Array>,
  ) {}

  async run(sql: string, parameter: readonly SqlWert[] = []): Promise<number> {
    // `false`: Das Plugin soll keine eigene Transaktion um die Anweisung legen.
    const ergebnis = await this.verbindung.run(sql, [...parameter], false);
    return ergebnis.changes?.changes ?? 0;
  }

  async query<T extends object = SqlZeile>(
    sql: string,
    parameter: readonly SqlWert[] = [],
  ): Promise<T[]> {
    const ergebnis = await this.verbindung.query(sql, [...parameter]);
    return (ergebnis.values ?? []) as T[];
  }

  async execute(sql: string): Promise<void> {
    // Einzeln ausführen: Das Plugin trennt Skripte an Semikolons und zerreißt Trigger.
    for (const anweisung of zerlegeSql(sql)) {
      await this.verbindung.run(anweisung, [], false);
    }
  }

  async begin(): Promise<void> {
    await this.verbindung.beginTransaction();
  }

  async commit(): Promise<void> {
    await this.verbindung.commitTransaction();
  }

  async rollback(): Promise<void> {
    await this.verbindung.rollbackTransaction();
  }

  exportieren(): Promise<Uint8Array> {
    return this.dateiLesen();
  }

  close(): Promise<void> {
    return this.verbindung.close();
  }
}
