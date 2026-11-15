import { InjectionToken } from '@angular/core';
import { NummernkreisTyp } from '../domain/nummern';

export interface NummernkreisStand {
  readonly typ: NummernkreisTyp;
  readonly jahr: number;
  /** Laufende Nummer, die als Nächstes vergeben wird. */
  readonly naechsteNummer: number;
  /** Sobald eine Nummer vergeben wurde, lässt sich der Startwert nicht mehr ändern. */
  readonly bereitsVergeben: boolean;
}

/**
 * Verwaltung der Nummernkreise. Die Vergabe selbst geschieht nicht hier, sondern
 * innerhalb der Transaktion, die den nummerierten Datensatz speichert.
 */
export interface NummernkreisRepository {
  stand(typ: NummernkreisTyp, jahr: number): Promise<NummernkreisStand>;
  /** Legt die erste Nummer eines Jahres fest (Übernahme aus einem bisherigen System). */
  setzeStartwert(typ: NummernkreisTyp, jahr: number, startwert: number): Promise<void>;
}

export const NUMMERNKREIS_REPOSITORY = new InjectionToken<NummernkreisRepository>(
  'NUMMERNKREIS_REPOSITORY',
);
