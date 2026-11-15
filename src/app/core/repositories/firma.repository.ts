import { InjectionToken } from '@angular/core';
import { Einstellungen, Firmendaten } from '../domain/firma';

export interface FirmendatenRepository {
  /** Liefert leere Firmendaten, solange noch nichts gespeichert wurde. */
  laden(): Promise<Firmendaten>;
  speichern(firmendaten: Firmendaten): Promise<void>;
}

export interface EinstellungenRepository {
  /** Liefert die Standardwerte, solange noch nichts gespeichert wurde. */
  laden(): Promise<Einstellungen>;
  speichern(einstellungen: Einstellungen): Promise<void>;
}

export const FIRMENDATEN_REPOSITORY = new InjectionToken<FirmendatenRepository>(
  'FIRMENDATEN_REPOSITORY',
);
export const EINSTELLUNGEN_REPOSITORY = new InjectionToken<EinstellungenRepository>(
  'EINSTELLUNGEN_REPOSITORY',
);
