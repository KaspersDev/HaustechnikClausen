import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { parseEuro } from '../core/domain/geld';
import {
  istGueltigeEmail,
  istGueltigeIban,
  istGueltigePlz,
  istGueltigeUstId,
} from '../core/domain/validierung';

const leer = (control: AbstractControl): boolean =>
  control.value === null || control.value === undefined || String(control.value).trim() === '';

function optional(schluessel: string, pruefung: (wert: string) => boolean): ValidatorFn {
  return (control) =>
    leer(control) || pruefung(String(control.value)) ? null : { [schluessel]: true };
}

export const pflicht: ValidatorFn = (control) => (leer(control) ? { pflicht: true } : null);
export const iban = optional('iban', istGueltigeIban);
export const email = optional('email', istGueltigeEmail);
export const ustId = optional('ustId', istGueltigeUstId);
export const euro = optional('euro', (wert) => parseEuro(wert) !== null);
export const euroNichtNegativ = optional('euro', (wert) => (parseEuro(wert) ?? -1) >= 0);

export function ganzzahl(min: number, max: number): ValidatorFn {
  return optional('ganzzahl', (wert) => {
    const zahl = Number(wert);
    return Number.isInteger(zahl) && zahl >= min && zahl <= max;
  });
}

/** Dezimalzahl mit Komma oder Punkt und höchstens drei Nachkommastellen, größer als 0. */
export const menge = optional('menge', (wert) => parseMenge(wert) !== null);

export function parseMenge(eingabe: string | number): number | null {
  const text = String(eingabe).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(text)) {
    return null;
  }
  const zahl = Number(text);
  return zahl > 0 ? zahl : null;
}

/** Menge für die Anzeige: „1,5" statt „1.5". */
export function formatiereMenge(wert: number): string {
  return (Math.round(wert * 1000) / 1000).toString().replace('.', ',');
}

/** Prüft die PLZ abhängig vom Land im Nachbarfeld (`landFeld`). */
export function plz(landFeld: string): ValidatorFn {
  return (control) => {
    const land = String(control.parent?.get(landFeld)?.value ?? '');
    return leer(control) || istGueltigePlz(String(control.value), land) ? null : { plz: true };
  };
}

const MELDUNGEN: Readonly<Record<string, string>> = {
  pflicht: 'bitte ausfüllen',
  iban: 'ungültige IBAN',
  email: 'ungültige E-Mail-Adresse',
  ustId: 'ungültige USt-IdNr.',
  plz: 'ungültige Postleitzahl',
  euro: 'ungültiger Betrag',
  ganzzahl: 'ungültige Zahl',
  menge: 'ungültige Menge',
  zeit: 'Ende muss nach dem Start liegen',
};

export function fehlertext(fehler: ValidationErrors | null | undefined): string {
  const schluessel = Object.keys(fehler ?? {})[0];
  return schluessel ? (MELDUNGEN[schluessel] ?? 'ungültige Eingabe') : '';
}

/**
 * Markiert alle Felder als berührt und liefert die Fehler als „Bezeichnung: Meldung".
 * `bezeichnungen` bestimmt Reihenfolge und Beschriftung.
 */
export function formularFehler(form: FormGroup, bezeichnungen: Record<string, string>): string[] {
  form.markAllAsTouched();
  const meldungen: string[] = [];
  for (const [feld, bezeichnung] of Object.entries(bezeichnungen)) {
    const control = form.get(feld);
    control?.updateValueAndValidity();
    if (control?.invalid) {
      meldungen.push(`${bezeichnung}: ${fehlertext(control.errors)}`);
    }
  }
  if (form.errors) {
    meldungen.push(fehlertext(form.errors));
  }
  return meldungen;
}
