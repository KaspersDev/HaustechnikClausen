import { InjectionToken } from '@angular/core';
import { Rechnung, RechnungEntwurfDaten, RechnungKopf, RechnungStatus } from '../domain/rechnung';

export interface RechnungFilter {
  readonly status?: RechnungStatus | null;
  /** Durchsucht Nummer und Empfänger. */
  readonly suche?: string;
}

export interface RechnungRepository {
  /** Entwürfe zuerst, danach nach Nummer absteigend. */
  alle(filter?: RechnungFilter): Promise<RechnungKopf[]>;
  finde(id: string): Promise<Rechnung | null>;
  /** Der offene Entwurf oder die gültige Rechnung zu einem Auftrag, falls vorhanden. */
  fuerAuftrag(auftragId: string): Promise<RechnungKopf | null>;

  /**
   * Legt einen Entwurf ohne Nummer an. Zu einem Auftrag darf es höchstens einen Entwurf
   * oder eine gültige Rechnung geben, und der Auftrag muss erledigt sein.
   */
  entwurfAnlegen(daten: RechnungEntwurfDaten): Promise<Rechnung>;
  entwurfAendern(id: string, daten: RechnungEntwurfDaten): Promise<Rechnung>;
  entwurfLoeschen(id: string): Promise<void>;

  /**
   * Schreibt den Entwurf fest: vergibt die nächste Rechnungsnummer, kopiert die
   * Empfängeranschrift, berechnet die Summen, setzt den Status „Versendet" und den
   * Auftrag auf „Abgerechnet" – alles in einer Transaktion. Danach ist die Rechnung
   * unveränderlich.
   */
  festschreiben(id: string): Promise<Rechnung>;
  alsBezahltMarkieren(id: string): Promise<Rechnung>;
  /**
   * Storniert eine festgeschriebene Rechnung: erzeugt eine Stornorechnung mit eigener
   * Nummer und negativen Beträgen, setzt das Original auf „Storniert" und den Auftrag
   * zurück auf „Erledigt". Liefert die Stornorechnung.
   */
  stornieren(id: string): Promise<Rechnung>;
}

export const RECHNUNG_REPOSITORY = new InjectionToken<RechnungRepository>('RECHNUNG_REPOSITORY');
