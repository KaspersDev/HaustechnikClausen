import { KundenTyp } from './kunde';
import { Summen, berechneSummen } from './summen';
import { PositionsTyp } from './typen';

export const RECHNUNG_STATUS = ['Entwurf', 'Versendet', 'Bezahlt', 'Storniert'] as const;
export type RechnungStatus = (typeof RECHNUNG_STATUS)[number];

export interface RechnungspositionDaten {
  readonly artikelId: string | null;
  readonly beschreibung: string;
  readonly menge: number;
  readonly einheit: string;
  readonly einzelpreisCent: number;
  readonly mwstSatz: number;
  readonly typ: PositionsTyp;
}

export interface Rechnungsposition extends RechnungspositionDaten {
  readonly id: string;
  /** Reihenfolge auf der Rechnung, ab 1. */
  readonly position: number;
}

/** Empfängerangaben, wie sie auf der Rechnung stehen (Momentaufnahme des Kunden). */
export interface Empfaenger {
  readonly typ: KundenTyp;
  readonly firma: string;
  readonly name: string;
  readonly strasse: string;
  readonly plz: string;
  readonly ort: string;
  readonly land: string;
  readonly ustId: string;
}

export interface RechnungEntwurfDaten {
  readonly kundeId: string;
  readonly auftragId: string | null;
  /** Rechnungsdatum „JJJJ-MM-TT". */
  readonly datum: string;
  readonly faelligAm: string;
  /** Tag der Leistung (Pflichtangabe nach § 14 UStG). */
  readonly leistungsdatum: string;
  readonly positionen: readonly RechnungspositionDaten[];
}

/** Rechnung ohne Positionen, für Listen. */
export interface RechnungKopf {
  readonly id: string;
  /** `null`, solange die Rechnung ein Entwurf ist. */
  readonly nummer: string | null;
  readonly kundeId: string;
  readonly auftragId: string | null;
  readonly datum: string;
  readonly faelligAm: string;
  readonly leistungsdatum: string;
  readonly status: RechnungStatus;
  readonly summeNettoCent: number;
  readonly summeMwstCent: number;
  readonly summeBruttoCent: number;
  readonly empfaenger: Empfaenger;
  /** Gesetzt bei einer Stornorechnung: die Rechnung, die sie aufhebt. */
  readonly stornoVonRechnungId: string | null;
}

export interface Rechnung extends RechnungKopf {
  readonly positionen: readonly Rechnungsposition[];
}

export const istStornorechnung = (r: Pick<RechnungKopf, 'stornoVonRechnungId'>): boolean =>
  r.stornoVonRechnungId !== null;

/** Bezeichnung für Listen und PDF. */
export function rechnungsart(r: Pick<RechnungKopf, 'stornoVonRechnungId' | 'status'>): string {
  if (istStornorechnung(r)) return 'Stornorechnung';
  return r.status === 'Entwurf' ? 'Rechnungsentwurf' : 'Rechnung';
}

export function pruefePosition(p: RechnungspositionDaten, nr: number): string[] {
  const fehler: string[] = [];
  if (p.beschreibung.trim() === '') fehler.push(`Position ${nr}: Beschreibung fehlt.`);
  if (!Number.isFinite(p.menge) || p.menge === 0) fehler.push(`Position ${nr}: Menge fehlt.`);
  if (!Number.isSafeInteger(p.einzelpreisCent) || p.einzelpreisCent < 0) {
    fehler.push(`Position ${nr}: Preis ist ungültig.`);
  }
  if (!Number.isInteger(p.mwstSatz) || p.mwstSatz < 0 || p.mwstSatz > 100) {
    fehler.push(`Position ${nr}: MwSt-Satz ist ungültig.`);
  }
  return fehler;
}

const istTag = (wert: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(wert);

export function pruefeEntwurf(daten: RechnungEntwurfDaten): string[] {
  const fehler: string[] = [];
  if (daten.kundeId.trim() === '') fehler.push('Der Kunde ist erforderlich.');
  if (!istTag(daten.datum)) fehler.push('Das Rechnungsdatum ist ungültig.');
  if (!istTag(daten.leistungsdatum)) fehler.push('Das Leistungsdatum ist ungültig.');
  if (!istTag(daten.faelligAm)) {
    fehler.push('Das Fälligkeitsdatum ist ungültig.');
  } else if (istTag(daten.datum) && daten.faelligAm < daten.datum) {
    fehler.push('Die Fälligkeit darf nicht vor dem Rechnungsdatum liegen.');
  }
  daten.positionen.forEach((p, index) => fehler.push(...pruefePosition(p, index + 1)));
  return fehler;
}

export function summenVon(positionen: readonly RechnungspositionDaten[]): Summen {
  return berechneSummen(positionen);
}
