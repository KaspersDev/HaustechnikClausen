import { InjectionToken } from '@angular/core';
import { Kunde, KundeDaten } from '../domain/kunde';

export interface KundeRepository {
  /** Nicht gelöschte Kunden, nach Name sortiert; `suche` filtert über alle Kontaktfelder. */
  alle(suche?: string): Promise<Kunde[]>;
  /** Liefert auch gelöschte Kunden, damit alte Aufträge und Rechnungen lesbar bleiben. */
  finde(id: string): Promise<Kunde | null>;
  anlegen(daten: KundeDaten): Promise<Kunde>;
  aendern(id: string, daten: KundeDaten): Promise<Kunde>;
  /** Soft Delete. Scheitert, wenn der Kunde Aufträge oder Rechnungen hat. */
  loeschen(id: string): Promise<void>;
}

export const KUNDE_REPOSITORY = new InjectionToken<KundeRepository>('KUNDE_REPOSITORY');
