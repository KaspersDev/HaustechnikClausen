import { PositionsTyp } from './typen';

export const EINHEITEN = ['Std', 'Stk', 'm', 'm²', 'm³', 'km', 'kg', 'l', 'pauschal'] as const;
export const MWST_SAETZE = [19, 7, 0] as const;

export interface ArtikelDaten {
  readonly bezeichnung: string;
  readonly einheit: string;
  readonly nettopreisCent: number;
  /** Ganzzahliger Prozentwert, z. B. 19. */
  readonly mwstSatz: number;
  readonly typ: PositionsTyp;
}

export interface Artikel extends ArtikelDaten {
  readonly id: string;
  readonly geloeschtAm: string | null;
}

export const LEERER_ARTIKEL: ArtikelDaten = {
  bezeichnung: '',
  einheit: 'Stk',
  nettopreisCent: 0,
  mwstSatz: 19,
  typ: 'Material',
};

/** Übliche Einheit je Typ als Vorschlag beim Anlegen. */
export const STANDARD_EINHEIT: Readonly<Record<PositionsTyp, string>> = {
  Arbeit: 'Std',
  Material: 'Stk',
  Anfahrt: 'pauschal',
};

export function pruefeArtikel(daten: ArtikelDaten): string[] {
  const fehler: string[] = [];
  if (daten.bezeichnung.trim() === '') fehler.push('Die Bezeichnung ist erforderlich.');
  if (daten.einheit.trim() === '') fehler.push('Die Einheit ist erforderlich.');
  if (!Number.isSafeInteger(daten.nettopreisCent) || daten.nettopreisCent < 0) {
    fehler.push('Der Preis muss ein Betrag ab 0,00 € sein.');
  }
  if (!Number.isInteger(daten.mwstSatz) || daten.mwstSatz < 0 || daten.mwstSatz > 100) {
    fehler.push('Der MwSt-Satz ist ungültig.');
  }
  return fehler;
}
