import { InjectionToken } from '@angular/core';

/** Quelle für den aktuellen Zeitpunkt; in Tests durch eine feste Uhr ersetzbar. */
export interface Uhr {
  jetzt(): Date;
}

export const UHR = new InjectionToken<Uhr>('UHR', {
  providedIn: 'root',
  factory: () => ({ jetzt: () => new Date() }),
});
