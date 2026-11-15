import { mwstCent, positionsbetragCent } from './geld';
import { POSITIONSTYPEN, PositionsTyp } from './typen';

/** Die für die Summenbildung nötigen Angaben einer Rechnungs- oder Angebotsposition. */
export interface SummenPosition {
  readonly menge: number;
  readonly einzelpreisCent: number;
  readonly mwstSatz: number;
  readonly typ: PositionsTyp;
}

export interface SteuersatzSumme {
  readonly mwstSatz: number;
  readonly nettoCent: number;
  readonly mwstCent: number;
}

export interface Summen {
  readonly nettoCent: number;
  readonly mwstCent: number;
  readonly bruttoCent: number;
  /** Aufsteigend nach Steuersatz; die MwSt wird je Satz auf die Netto-Summe gerechnet. */
  readonly jeSteuersatz: readonly SteuersatzSumme[];
  /** Netto-Zwischensummen je Typ für den getrennten Ausweis nach § 35a EStG. */
  readonly jeTyp: Readonly<Record<PositionsTyp, number>>;
}

export function berechneSummen(positionen: readonly SummenPosition[]): Summen {
  const nettoJeSatz = new Map<number, number>();
  const jeTyp: Record<PositionsTyp, number> = { Arbeit: 0, Material: 0, Anfahrt: 0 };

  for (const position of positionen) {
    if (!POSITIONSTYPEN.includes(position.typ)) {
      throw new Error(`Unbekannter Positionstyp: ${String(position.typ)}`);
    }
    const betrag = positionsbetragCent(position.menge, position.einzelpreisCent);
    nettoJeSatz.set(position.mwstSatz, (nettoJeSatz.get(position.mwstSatz) ?? 0) + betrag);
    jeTyp[position.typ] += betrag;
  }

  const jeSteuersatz = [...nettoJeSatz.entries()]
    .sort(([a], [b]) => a - b)
    .map(([mwstSatz, nettoCent]) => ({
      mwstSatz,
      nettoCent,
      mwstCent: mwstCent(nettoCent, mwstSatz),
    }));

  const nettoCent = jeSteuersatz.reduce((summe, s) => summe + s.nettoCent, 0);
  const steuer = jeSteuersatz.reduce((summe, s) => summe + s.mwstCent, 0);

  return { nettoCent, mwstCent: steuer, bruttoCent: nettoCent + steuer, jeSteuersatz, jeTyp };
}
