import { Kunde, KundeDaten, KundenTyp, kundenname, pruefeKunde } from '../../domain/kunde';
import { normalisiere, passtZurSuche } from '../../domain/suche';
import { KundeRepository } from '../kunde.repository';
import { RepoKontext } from './kontext';

interface KundeZeile {
  id: string;
  typ: KundenTyp;
  firma: string;
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  email: string;
  telefon: string;
  ust_id: string;
  erstellt_am: string;
  geloescht_am: string | null;
}

const ausZeile = (z: KundeZeile): Kunde => ({
  id: z.id,
  typ: z.typ,
  firma: z.firma,
  name: z.name,
  strasse: z.strasse,
  plz: z.plz,
  ort: z.ort,
  land: z.land,
  email: z.email,
  telefon: z.telefon,
  ustId: z.ust_id,
  erstelltAm: z.erstellt_am,
  geloeschtAm: z.geloescht_am,
});

function bereinigt(daten: KundeDaten): KundeDaten {
  const fehler = pruefeKunde(daten);
  if (fehler.length > 0) {
    throw new Error(fehler.join(' '));
  }
  return {
    typ: daten.typ,
    firma: daten.typ === 'Gewerbe' ? daten.firma.trim() : '',
    name: daten.name.trim(),
    strasse: daten.strasse.trim(),
    plz: daten.plz.trim(),
    ort: daten.ort.trim(),
    land: daten.land.trim(),
    email: daten.email.trim(),
    telefon: daten.telefon.trim(),
    ustId: daten.typ === 'Gewerbe' ? daten.ustId.replace(/\s+/g, '').toUpperCase() : '',
  };
}

export class SqliteKundeRepository implements KundeRepository {
  constructor(private readonly kontext: RepoKontext) {}

  async alle(suche = ''): Promise<Kunde[]> {
    const zeilen = await this.kontext.db.query<KundeZeile>(
      'SELECT * FROM kunde WHERE geloescht_am IS NULL',
    );
    return zeilen
      .map(ausZeile)
      .filter((k) =>
        passtZurSuche(suche, [k.firma, k.name, k.strasse, k.plz, k.ort, k.email, k.telefon]),
      )
      .sort((a, b) => normalisiere(kundenname(a)).localeCompare(normalisiere(kundenname(b)), 'de'));
  }

  async finde(id: string): Promise<Kunde | null> {
    const [zeile] = await this.kontext.db.query<KundeZeile>('SELECT * FROM kunde WHERE id = ?', [
      id,
    ]);
    return zeile ? ausZeile(zeile) : null;
  }

  async anlegen(daten: KundeDaten): Promise<Kunde> {
    const d = bereinigt(daten);
    const id = this.kontext.neueId();
    const jetzt = this.kontext.jetzt();
    await this.kontext.db.run(
      `INSERT INTO kunde (id, typ, firma, name, strasse, plz, ort, land, email, telefon, ust_id,
         erstellt_am, geaendert_am) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        d.typ,
        d.firma,
        d.name,
        d.strasse,
        d.plz,
        d.ort,
        d.land,
        d.email,
        d.telefon,
        d.ustId,
        jetzt,
        jetzt,
      ],
    );
    return { ...d, id, erstelltAm: jetzt, geloeschtAm: null };
  }

  async aendern(id: string, daten: KundeDaten): Promise<Kunde> {
    const d = bereinigt(daten);
    const geaendert = await this.kontext.db.run(
      `UPDATE kunde SET typ = ?, firma = ?, name = ?, strasse = ?, plz = ?, ort = ?, land = ?,
         email = ?, telefon = ?, ust_id = ?, geaendert_am = ?
       WHERE id = ? AND geloescht_am IS NULL`,
      [
        d.typ,
        d.firma,
        d.name,
        d.strasse,
        d.plz,
        d.ort,
        d.land,
        d.email,
        d.telefon,
        d.ustId,
        this.kontext.jetzt(),
        id,
      ],
    );
    const kunde = geaendert === 1 ? await this.finde(id) : null;
    if (!kunde) {
      throw new Error('Der Kunde wurde nicht gefunden.');
    }
    return kunde;
  }

  async loeschen(id: string): Promise<void> {
    await this.kontext.db.transaction(async (tx) => {
      const [verwendung] = await tx.query<{ auftraege: number; rechnungen: number }>(
        `SELECT
           (SELECT COUNT(*) FROM auftrag WHERE kunde_id = ? AND geloescht_am IS NULL) AS auftraege,
           (SELECT COUNT(*) FROM rechnung WHERE kunde_id = ? AND geloescht_am IS NULL) AS rechnungen`,
        [id, id],
      );
      if (verwendung.auftraege > 0 || verwendung.rechnungen > 0) {
        throw new Error(
          'Der Kunde hat Aufträge oder Rechnungen und kann deshalb nicht gelöscht werden.',
        );
      }
      const jetzt = this.kontext.jetzt();
      await tx.run('UPDATE kunde SET geloescht_am = ?, geaendert_am = ? WHERE id = ?', [
        jetzt,
        jetzt,
        id,
      ]);
    });
  }
}
