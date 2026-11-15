import { Injectable, inject } from '@angular/core';
import { plusTage, tagVon } from '../domain/datum';
import { RechnungKopf } from '../domain/rechnung';
import { positionenAusAuftrag } from '../domain/rechnung-aus-auftrag';
import { ARTIKEL_REPOSITORY } from '../repositories/artikel.repository';
import { AUFTRAG_REPOSITORY } from '../repositories/auftrag.repository';
import {
  MATERIALEINTRAG_REPOSITORY,
  ZEITEINTRAG_REPOSITORY,
} from '../repositories/erfassung.repository';
import { EINSTELLUNGEN_REPOSITORY } from '../repositories/firma.repository';
import { RECHNUNG_REPOSITORY } from '../repositories/rechnung.repository';
import { UHR } from './uhr';

/** Anwendungsfall „Rechnung aus Auftrag erzeugen": übernimmt Kunde, Zeiten und Material. */
@Injectable({ providedIn: 'root' })
export class RechnungAusAuftragService {
  private readonly auftraege = inject(AUFTRAG_REPOSITORY);
  private readonly zeiten = inject(ZEITEINTRAG_REPOSITORY);
  private readonly material = inject(MATERIALEINTRAG_REPOSITORY);
  private readonly artikel = inject(ARTIKEL_REPOSITORY);
  private readonly einstellungen = inject(EINSTELLUNGEN_REPOSITORY);
  private readonly rechnungen = inject(RECHNUNG_REPOSITORY);
  private readonly uhr = inject(UHR);

  /**
   * Legt den Rechnungsentwurf zu einem erledigten Auftrag an. Gibt es bereits einen
   * Entwurf, wird dieser geliefert; gibt es eine gültige Rechnung, schlägt der Aufruf fehl.
   */
  async erzeuge(auftragId: string): Promise<RechnungKopf> {
    const auftrag = await this.auftraege.finde(auftragId);
    if (!auftrag) {
      throw new Error('Der Auftrag wurde nicht gefunden.');
    }
    const vorhanden = await this.rechnungen.fuerAuftrag(auftragId);
    if (vorhanden?.status === 'Entwurf') {
      return vorhanden;
    }
    if (vorhanden) {
      throw new Error(
        `Der Auftrag wurde bereits mit ${vorhanden.nummer ?? 'einer Rechnung'} abgerechnet.`,
      );
    }
    if (auftrag.status !== 'Erledigt') {
      throw new Error('Nur erledigte Aufträge können abgerechnet werden.');
    }

    const einstellungen = await this.einstellungen.laden();
    const stundensatzId = einstellungen.standardStundensatzArtikelId;
    const [zeiten, material, stundensatz] = await Promise.all([
      this.zeiten.fuerAuftrag(auftragId),
      this.material.fuerAuftrag(auftragId),
      stundensatzId ? this.artikel.finde(stundensatzId) : Promise.resolve(null),
    ]);
    const positionen = positionenAusAuftrag(
      zeiten,
      material,
      stundensatz && !stundensatz.geloeschtAm ? stundensatz : null,
    );

    const heute = tagVon(this.uhr.jetzt());
    return this.rechnungen.entwurfAnlegen({
      kundeId: auftrag.kundeId,
      auftragId,
      datum: heute,
      faelligAm: plusTage(heute, einstellungen.zahlungszielTage),
      leistungsdatum: auftrag.erledigtAm ? tagVon(new Date(auftrag.erledigtAm)) : heute,
      positionen,
    });
  }
}
