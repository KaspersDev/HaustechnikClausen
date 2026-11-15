import { Datenbank } from '../../db/datenbank';

/** Was jedes SQLite-Repository braucht: Datenbank, Uhr und ID-Erzeugung (in Tests ersetzbar). */
export interface RepoKontext {
  readonly db: Datenbank;
  /** Aktueller Zeitpunkt als ISO-8601-String in UTC. */
  jetzt(): string;
  neueId(): string;
}

export function standardKontext(db: Datenbank): RepoKontext {
  return {
    db,
    jetzt: () => new Date().toISOString(),
    neueId: () => crypto.randomUUID(),
  };
}
