import { InjectionToken } from '@angular/core';
import {
  Materialeintrag,
  MaterialeintragDaten,
  Zeiteintrag,
  ZeiteintragDaten,
} from '../domain/erfassung';

/** Zeiten eines Auftrags. Schreibzugriffe scheitern, sobald der Auftrag abgerechnet ist. */
export interface ZeiteintragRepository {
  /** Nach Startzeit aufsteigend. */
  fuerAuftrag(auftragId: string): Promise<Zeiteintrag[]>;
  anlegen(auftragId: string, daten: ZeiteintragDaten): Promise<Zeiteintrag>;
  aendern(id: string, daten: ZeiteintragDaten): Promise<Zeiteintrag>;
  loeschen(id: string): Promise<void>;
}

/**
 * Material und Anfahrt eines Auftrags (jeder Artikeltyp ist erlaubt).
 * Schreibzugriffe scheitern, sobald der Auftrag abgerechnet ist.
 */
export interface MaterialeintragRepository {
  /** In der Reihenfolge der Erfassung. */
  fuerAuftrag(auftragId: string): Promise<Materialeintrag[]>;
  anlegen(auftragId: string, daten: MaterialeintragDaten): Promise<Materialeintrag>;
  aendern(id: string, daten: MaterialeintragDaten): Promise<Materialeintrag>;
  loeschen(id: string): Promise<void>;
}

export const ZEITEINTRAG_REPOSITORY = new InjectionToken<ZeiteintragRepository>(
  'ZEITEINTRAG_REPOSITORY',
);
export const MATERIALEINTRAG_REPOSITORY = new InjectionToken<MaterialeintragRepository>(
  'MATERIALEINTRAG_REPOSITORY',
);
