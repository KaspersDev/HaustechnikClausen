import type { Database, SqlJsStatic } from 'sql.js';
import { DbTreiber, SqlWert, SqlZeile } from './datenbank';

/**
 * SQLite über sql.js (WebAssembly). Wird in Tests und im Browser (Entwicklung)
 * verwendet; auf dem Tablet läuft stattdessen der Capacitor-Treiber.
 */
export class SqlJsTreiber implements DbTreiber {
  /** Wird nach jeder schreibenden Anweisung außerhalb und nach jedem Commit aufgerufen. */
  nachAenderung: (() => void) | null = null;
  private inTransaktion = false;

  constructor(private readonly db: Database) {
    this.db.run('PRAGMA foreign_keys = ON');
  }

  static async oeffnen(sql: SqlJsStatic, inhalt?: Uint8Array): Promise<SqlJsTreiber> {
    return new SqlJsTreiber(new sql.Database(inhalt));
  }

  async run(sql: string, parameter: readonly SqlWert[] = []): Promise<number> {
    this.db.run(sql, [...parameter]);
    const geaendert = this.db.getRowsModified();
    this.melden();
    return geaendert;
  }

  async query<T extends object = SqlZeile>(
    sql: string,
    parameter: readonly SqlWert[] = [],
  ): Promise<T[]> {
    const anweisung = this.db.prepare(sql);
    try {
      anweisung.bind([...parameter]);
      const zeilen: T[] = [];
      while (anweisung.step()) {
        zeilen.push(anweisung.getAsObject() as T);
      }
      return zeilen;
    } finally {
      anweisung.free();
    }
  }

  async execute(sql: string): Promise<void> {
    this.db.exec(sql);
    this.melden();
  }

  async begin(): Promise<void> {
    this.db.run('BEGIN');
    this.inTransaktion = true;
  }

  async commit(): Promise<void> {
    this.db.run('COMMIT');
    this.inTransaktion = false;
    this.melden();
  }

  async rollback(): Promise<void> {
    this.inTransaktion = false;
    this.db.run('ROLLBACK');
  }

  async exportieren(): Promise<Uint8Array> {
    const inhalt = this.db.export();
    // sql.js setzt beim Export die Verbindungseinstellungen zurück.
    this.db.run('PRAGMA foreign_keys = ON');
    return inhalt;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private melden(): void {
    if (!this.inTransaktion) {
      this.nachAenderung?.();
    }
  }
}
