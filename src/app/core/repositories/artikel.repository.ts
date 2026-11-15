import { InjectionToken } from '@angular/core';
import { Artikel, ArtikelDaten } from '../domain/artikel';
import { PositionsTyp } from '../domain/typen';

export interface ArtikelFilter {
  readonly suche?: string;
  readonly typ?: PositionsTyp | null;
}

export interface ArtikelRepository {
  /** Nicht gelöschte Artikel, nach Bezeichnung sortiert. */
  alle(filter?: ArtikelFilter): Promise<Artikel[]>;
  /** Liefert auch gelöschte Artikel, damit alte Einträge lesbar bleiben. */
  finde(id: string): Promise<Artikel | null>;
  anlegen(daten: ArtikelDaten): Promise<Artikel>;
  aendern(id: string, daten: ArtikelDaten): Promise<Artikel>;
  /** Soft Delete. Bestehende Einträge und Rechnungen bleiben unberührt. */
  loeschen(id: string): Promise<void>;
}

export const ARTIKEL_REPOSITORY = new InjectionToken<ArtikelRepository>('ARTIKEL_REPOSITORY');
