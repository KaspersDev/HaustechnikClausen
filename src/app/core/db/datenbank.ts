import { InjectionToken } from '@angular/core';

export type SqlWert = string | number | null;
export type SqlZeile = Record<string, SqlWert>;

/** Lese- und Schreibzugriff; innerhalb einer Transaktion der einzige erlaubte Zugang. */
export interface DbZugriff {
  /** Führt eine einzelne Anweisung aus und liefert die Zahl der geänderten Zeilen. */
  run(sql: string, parameter?: readonly SqlWert[]): Promise<number>;
  query<T extends object = SqlZeile>(sql: string, parameter?: readonly SqlWert[]): Promise<T[]>;
  /** Führt mehrere durch Semikolon getrennte Anweisungen ohne Parameter aus (Migrationen). */
  execute(sql: string): Promise<void>;
}

/**
 * Dünne Schnittstelle über SQLite. Alle Aufrufe laufen streng nacheinander:
 * Solange eine Transaktion läuft, warten andere Aufrufe, bis sie beendet ist.
 */
export interface Datenbank extends DbZugriff {
  /**
   * Führt `arbeit` in einer Transaktion aus. Wirft `arbeit`, wird alles zurückgerollt.
   * Innerhalb von `arbeit` ausschließlich das übergebene `tx` verwenden – ein Aufruf
   * über die äußere Datenbank würde auf das Ende der eigenen Transaktion warten.
   */
  transaction<T>(arbeit: (tx: DbZugriff) => Promise<T>): Promise<T>;
  /** Vollständiger Datenbankinhalt als SQLite-Datei (für Export/Backup). */
  exportieren(): Promise<Uint8Array>;
  close(): Promise<void>;
}

export const DATENBANK = new InjectionToken<Datenbank>('DATENBANK');

/**
 * Low-Level-Treiber ohne Sperrlogik. Wird von `SerielleDatenbank` umhüllt.
 */
export interface DbTreiber extends DbZugriff {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  exportieren(): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** Serialisiert alle Zugriffe auf einen Treiber und stellt Transaktionen bereit. */
export class SerielleDatenbank implements Datenbank {
  private warteschlange: Promise<unknown> = Promise.resolve();

  constructor(private readonly treiber: DbTreiber) {}

  run(sql: string, parameter?: readonly SqlWert[]): Promise<number> {
    return this.einreihen(() => this.treiber.run(sql, parameter));
  }

  query<T extends object = SqlZeile>(sql: string, parameter?: readonly SqlWert[]): Promise<T[]> {
    return this.einreihen(() => this.treiber.query<T>(sql, parameter));
  }

  execute(sql: string): Promise<void> {
    return this.einreihen(() => this.treiber.execute(sql));
  }

  transaction<T>(arbeit: (tx: DbZugriff) => Promise<T>): Promise<T> {
    return this.einreihen(async () => {
      await this.treiber.begin();
      try {
        const ergebnis = await arbeit(this.treiber);
        await this.treiber.commit();
        return ergebnis;
      } catch (fehler) {
        await this.treiber.rollback();
        throw fehler;
      }
    });
  }

  exportieren(): Promise<Uint8Array> {
    return this.einreihen(() => this.treiber.exportieren());
  }

  close(): Promise<void> {
    return this.einreihen(() => this.treiber.close());
  }

  private einreihen<T>(aufgabe: () => Promise<T>): Promise<T> {
    const ergebnis = this.warteschlange.then(aufgabe);
    this.warteschlange = ergebnis.catch(() => undefined);
    return ergebnis;
  }
}
