import { Artikel } from './artikel';
import { Materialeintrag, Zeiteintrag, dauerMinuten, stundenAufViertel } from './erfassung';
import { RechnungspositionDaten } from './rechnung';
import { POSITIONSTYPEN } from './typen';

export const OHNE_TAETIGKEIT = 'Arbeitszeit';

/**
 * Baut die Rechnungspositionen eines Auftrags: Zeiten je Tätigkeit zusammengefasst,
 * auf Viertelstunden aufgerundet und mit dem Stundensatz bewertet; Material und Anfahrt
 * je Eintrag. Reihenfolge: Arbeit, Material, Anfahrt.
 */
export function positionenAusAuftrag(
  zeiten: readonly Zeiteintrag[],
  material: readonly Materialeintrag[],
  stundensatz: Artikel | null,
): RechnungspositionDaten[] {
  const minutenJeTaetigkeit = new Map<string, number>();
  for (const zeit of zeiten) {
    const taetigkeit = zeit.taetigkeit.trim() || OHNE_TAETIGKEIT;
    minutenJeTaetigkeit.set(
      taetigkeit,
      (minutenJeTaetigkeit.get(taetigkeit) ?? 0) + dauerMinuten(zeit),
    );
  }
  if (minutenJeTaetigkeit.size > 0 && !stundensatz) {
    throw new Error(
      'Für die erfassten Zeiten fehlt der Standard-Stundensatz. Bitte unter „Artikel & Leistungen" einen Artikel vom Typ Arbeit als Standard-Stundensatz kennzeichnen.',
    );
  }

  const positionen: RechnungspositionDaten[] = [];
  if (stundensatz) {
    for (const [taetigkeit, minuten] of minutenJeTaetigkeit) {
      positionen.push({
        artikelId: stundensatz.id,
        beschreibung: taetigkeit,
        menge: stundenAufViertel(minuten),
        einheit: stundensatz.einheit,
        einzelpreisCent: stundensatz.nettopreisCent,
        mwstSatz: stundensatz.mwstSatz,
        typ: 'Arbeit',
      });
    }
  }
  for (const eintrag of material) {
    positionen.push({
      artikelId: eintrag.artikelId,
      beschreibung: eintrag.bezeichnung,
      menge: eintrag.menge,
      einheit: eintrag.einheit,
      einzelpreisCent: eintrag.einzelpreisCent,
      mwstSatz: eintrag.mwstSatz,
      typ: eintrag.typ,
    });
  }
  return positionen.sort((a, b) => POSITIONSTYPEN.indexOf(a.typ) - POSITIONSTYPEN.indexOf(b.typ));
}
