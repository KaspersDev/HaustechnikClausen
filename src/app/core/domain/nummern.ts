export const NUMMERNKREIS_TYPEN = ['Rechnung', 'Angebot', 'Auftrag'] as const;
export type NummernkreisTyp = (typeof NUMMERNKREIS_TYPEN)[number];

export const STANDARD_PRAEFIXE: Readonly<Record<NummernkreisTyp, string>> = {
  Rechnung: 'RE',
  Angebot: 'AN',
  Auftrag: 'AU',
};

/** („RE", 2026, 7) → „RE-2026-0007". Ab 10000 wächst die Nummer ohne Kürzung weiter. */
export function formatiereNummer(praefix: string, jahr: number, laufendeNummer: number): string {
  if (!Number.isInteger(jahr) || !Number.isInteger(laufendeNummer) || laufendeNummer < 1) {
    throw new Error(`Ungültige Nummer: ${jahr}/${laufendeNummer}`);
  }
  return `${praefix}-${jahr}-${laufendeNummer.toString().padStart(4, '0')}`;
}
