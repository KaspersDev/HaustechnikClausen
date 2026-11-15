import { InjectionToken } from '@angular/core';
import { Auftrag, AuftragDaten, AuftragMitKunde, AuftragStatus } from '../domain/auftrag';

export interface AuftragRepository {
  /** Alle Aufträge, je Status nach `sortierung`; `suche` filtert über Nummer, Titel, Kunde, Ort. */
  alle(suche?: string): Promise<AuftragMitKunde[]>;
  finde(id: string): Promise<AuftragMitKunde | null>;
  /** Vergibt die nächste Auftragsnummer und stellt den Auftrag ans Ende der Spalte „Offen". */
  anlegen(daten: AuftragDaten): Promise<Auftrag>;
  /** Abgerechnete Aufträge lassen sich nicht mehr ändern. */
  aendern(id: string, daten: AuftragDaten): Promise<Auftrag>;
  /**
   * Setzt Status und Position in der Zielspalte (`index` ab 0; ohne Angabe ans Ende).
   * „Erledigt" setzt `erledigtAm`, das Verlassen von „Erledigt" löscht es wieder.
   */
  verschiebe(id: string, status: AuftragStatus, index?: number): Promise<Auftrag>;
}

export const AUFTRAG_REPOSITORY = new InjectionToken<AuftragRepository>('AUFTRAG_REPOSITORY');
