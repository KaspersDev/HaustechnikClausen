import { Adresse } from './kunde';

export const AUFTRAG_STATUS = ['Offen', 'InArbeit', 'Erledigt', 'Abgerechnet'] as const;
export type AuftragStatus = (typeof AUFTRAG_STATUS)[number];

export const STATUS_TITEL: Readonly<Record<AuftragStatus, string>> = {
  Offen: 'Offen',
  InArbeit: 'In Arbeit',
  Erledigt: 'Erledigt',
  Abgerechnet: 'Abgerechnet',
};

export interface AuftragDaten {
  readonly kundeId: string;
  readonly titel: string;
  readonly beschreibung: string;
  /** Ort der Arbeiten; kann von der Rechnungsadresse des Kunden abweichen. */
  readonly einsatzort: Adresse;
  /** Geplanter Tag als „JJJJ-MM-TT" oder `null`. */
  readonly geplantAm: string | null;
}

export interface Auftrag extends AuftragDaten {
  readonly id: string;
  readonly nummer: string;
  readonly status: AuftragStatus;
  readonly erledigtAm: string | null;
  readonly rechnungId: string | null;
  /** Reihenfolge innerhalb der Kanban-Spalte, aufsteigend. */
  readonly sortierung: number;
  readonly erstelltAm: string;
}

/** Auftrag mit den Kundenangaben, die Listen und Karten anzeigen. */
export interface AuftragMitKunde extends Auftrag {
  readonly kundeName: string;
}

/**
 * Offen, In Arbeit und Erledigt lassen sich frei wechseln. „Abgerechnet" entsteht nur
 * durch das Festschreiben einer Rechnung und ist danach fixiert.
 */
export function istStatuswechselErlaubt(von: AuftragStatus, nach: AuftragStatus): boolean {
  return von !== 'Abgerechnet' && nach !== 'Abgerechnet';
}

export function pruefeAuftrag(daten: AuftragDaten): string[] {
  const fehler: string[] = [];
  if (daten.kundeId.trim() === '') fehler.push('Der Kunde ist erforderlich.');
  if (daten.titel.trim() === '') fehler.push('Der Titel ist erforderlich.');
  if (daten.geplantAm !== null && !/^\d{4}-\d{2}-\d{2}$/.test(daten.geplantAm)) {
    fehler.push('Das geplante Datum ist ungültig.');
  }
  return fehler;
}

export function gleicheAdresse(a: Adresse, b: Adresse): boolean {
  return a.strasse === b.strasse && a.plz === b.plz && a.ort === b.ort && a.land === b.land;
}
