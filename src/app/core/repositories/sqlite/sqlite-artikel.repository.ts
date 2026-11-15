import { Artikel, ArtikelDaten, pruefeArtikel } from '../../domain/artikel';
import { normalisiere, passtZurSuche } from '../../domain/suche';
import { PositionsTyp } from '../../domain/typen';
import { ArtikelFilter, ArtikelRepository } from '../artikel.repository';
import { RepoKontext } from './kontext';

interface ArtikelZeile {
  id: string;
  bezeichnung: string;
  einheit: string;
  nettopreis_cent: number;
  mwst_satz: number;
  typ: PositionsTyp;
  geloescht_am: string | null;
}

const ausZeile = (z: ArtikelZeile): Artikel => ({
  id: z.id,
  bezeichnung: z.bezeichnung,
  einheit: z.einheit,
  nettopreisCent: z.nettopreis_cent,
  mwstSatz: z.mwst_satz,
  typ: z.typ,
  geloeschtAm: z.geloescht_am,
});

function bereinigt(daten: ArtikelDaten): ArtikelDaten {
  const fehler = pruefeArtikel(daten);
  if (fehler.length > 0) {
    throw new Error(fehler.join(' '));
  }
  return { ...daten, bezeichnung: daten.bezeichnung.trim(), einheit: daten.einheit.trim() };
}

export class SqliteArtikelRepository implements ArtikelRepository {
  constructor(private readonly kontext: RepoKontext) {}

  async alle(filter: ArtikelFilter = {}): Promise<Artikel[]> {
    const zeilen = await this.kontext.db.query<ArtikelZeile>(
      'SELECT * FROM artikel WHERE geloescht_am IS NULL',
    );
    return zeilen
      .map(ausZeile)
      .filter((a) => !filter.typ || a.typ === filter.typ)
      .filter((a) => passtZurSuche(filter.suche ?? '', [a.bezeichnung]))
      .sort((a, b) => normalisiere(a.bezeichnung).localeCompare(normalisiere(b.bezeichnung), 'de'));
  }

  async finde(id: string): Promise<Artikel | null> {
    const [zeile] = await this.kontext.db.query<ArtikelZeile>(
      'SELECT * FROM artikel WHERE id = ?',
      [id],
    );
    return zeile ? ausZeile(zeile) : null;
  }

  async anlegen(daten: ArtikelDaten): Promise<Artikel> {
    const d = bereinigt(daten);
    const id = this.kontext.neueId();
    const jetzt = this.kontext.jetzt();
    await this.kontext.db.run(
      `INSERT INTO artikel (id, bezeichnung, einheit, nettopreis_cent, mwst_satz, typ,
         erstellt_am, geaendert_am) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, d.bezeichnung, d.einheit, d.nettopreisCent, d.mwstSatz, d.typ, jetzt, jetzt],
    );
    return { ...d, id, geloeschtAm: null };
  }

  async aendern(id: string, daten: ArtikelDaten): Promise<Artikel> {
    const d = bereinigt(daten);
    const geaendert = await this.kontext.db.run(
      `UPDATE artikel SET bezeichnung = ?, einheit = ?, nettopreis_cent = ?, mwst_satz = ?,
         typ = ?, geaendert_am = ? WHERE id = ? AND geloescht_am IS NULL`,
      [d.bezeichnung, d.einheit, d.nettopreisCent, d.mwstSatz, d.typ, this.kontext.jetzt(), id],
    );
    if (geaendert !== 1) {
      throw new Error('Der Artikel wurde nicht gefunden.');
    }
    return { ...d, id, geloeschtAm: null };
  }

  async loeschen(id: string): Promise<void> {
    await this.kontext.db.transaction(async (tx) => {
      const jetzt = this.kontext.jetzt();
      await tx.run('UPDATE artikel SET geloescht_am = ?, geaendert_am = ? WHERE id = ?', [
        jetzt,
        jetzt,
        id,
      ]);
      // Ein gelöschter Artikel kann nicht Standard-Stundensatz bleiben.
      await tx.run(
        `UPDATE einstellungen SET standard_stundensatz_artikel_id = NULL, geaendert_am = ?
         WHERE standard_stundensatz_artikel_id = ?`,
        [jetzt, id],
      );
    });
  }
}
