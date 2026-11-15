import { positionsbetragCent } from './geld';
import { PositionsTyp } from './typen';

export interface ZeiteintragDaten {
  /** ISO-8601-Zeitpunkte in UTC. */
  readonly start: string;
  readonly ende: string;
  readonly pauseMinuten: number;
  readonly taetigkeit: string;
}

export interface Zeiteintrag extends ZeiteintragDaten {
  readonly id: string;
  readonly auftragId: string;
}

export interface MaterialeintragDaten {
  readonly artikelId: string;
  readonly menge: number;
  readonly einzelpreisCent: number;
}

/** Materialeintrag mit den Artikelangaben für Anzeige und Rechnung. */
export interface Materialeintrag extends MaterialeintragDaten {
  readonly id: string;
  readonly auftragId: string;
  readonly bezeichnung: string;
  readonly einheit: string;
  readonly mwstSatz: number;
  readonly typ: PositionsTyp;
}

/** Arbeitszeit in Minuten: Ende minus Start minus Pause. */
export function dauerMinuten(
  eintrag: Pick<ZeiteintragDaten, 'start' | 'ende' | 'pauseMinuten'>,
): number {
  const brutto = Math.round((Date.parse(eintrag.ende) - Date.parse(eintrag.start)) / 60000);
  return brutto - eintrag.pauseMinuten;
}

export function pruefeZeiteintrag(daten: ZeiteintragDaten): string[] {
  const start = Date.parse(daten.start);
  const ende = Date.parse(daten.ende);
  if (Number.isNaN(start) || Number.isNaN(ende)) {
    return ['Start und Ende müssen gültige Zeitpunkte sein.'];
  }
  if (ende <= start) {
    return ['Das Ende muss nach dem Start liegen.'];
  }
  if (!Number.isInteger(daten.pauseMinuten) || daten.pauseMinuten < 0) {
    return ['Die Pause muss eine ganze Zahl von Minuten sein.'];
  }
  if (dauerMinuten(daten) <= 0) {
    return ['Die Pause ist länger als die erfasste Zeit.'];
  }
  return [];
}

export function pruefeMaterialeintrag(daten: MaterialeintragDaten): string[] {
  const fehler: string[] = [];
  if (daten.artikelId.trim() === '') fehler.push('Der Artikel ist erforderlich.');
  if (!Number.isFinite(daten.menge) || daten.menge <= 0) {
    fehler.push('Die Menge muss größer als 0 sein.');
  }
  if (!Number.isSafeInteger(daten.einzelpreisCent) || daten.einzelpreisCent < 0) {
    fehler.push('Der Preis muss ein Betrag ab 0,00 € sein.');
  }
  return fehler;
}

/** Minuten auf volle Viertelstunden aufgerundet, als Stunden (z. B. 50 → 1, 61 → 1,25). */
export function stundenAufViertel(minuten: number): number {
  return Math.ceil(minuten / 15) / 4;
}

/** 150 → „2:30 h". */
export function formatiereDauer(minuten: number): string {
  const stunden = Math.floor(minuten / 60);
  return `${stunden}:${(minuten % 60).toString().padStart(2, '0')} h`;
}

export function summeMinuten(eintraege: readonly ZeiteintragDaten[]): number {
  return eintraege.reduce((summe, e) => summe + dauerMinuten(e), 0);
}

export function summeMaterialCent(eintraege: readonly MaterialeintragDaten[]): number {
  return eintraege.reduce((summe, e) => summe + positionsbetragCent(e.menge, e.einzelpreisCent), 0);
}
