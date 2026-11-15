import { DbZugriff } from '../../db/datenbank';
import { NummernkreisTyp, STANDARD_PRAEFIXE, formatiereNummer } from '../../domain/nummern';

const PRAEFIX_SPALTE: Readonly<Record<NummernkreisTyp, string>> = {
  Rechnung: 'praefix_rechnung',
  Angebot: 'praefix_angebot',
  Auftrag: 'praefix_auftrag',
};

/**
 * Vergibt die nächste fortlaufende Nummer. Muss mit dem `tx` der Transaktion aufgerufen
 * werden, die den nummerierten Datensatz speichert: Scheitert das Speichern, wird auch
 * der Zähler zurückgerollt und es entsteht keine Lücke.
 */
export async function vergibNummer(
  tx: DbZugriff,
  typ: NummernkreisTyp,
  jahr: number,
): Promise<string> {
  await tx.run(
    'INSERT OR IGNORE INTO nummernkreis (typ, jahr, startwert, naechste_nummer) VALUES (?, ?, 1, 1)',
    [typ, jahr],
  );
  const [stand] = await tx.query<{ naechste_nummer: number }>(
    'SELECT naechste_nummer FROM nummernkreis WHERE typ = ? AND jahr = ?',
    [typ, jahr],
  );
  await tx.run(
    'UPDATE nummernkreis SET naechste_nummer = naechste_nummer + 1 WHERE typ = ? AND jahr = ?',
    [typ, jahr],
  );
  return formatiereNummer(await lesePraefix(tx, typ), jahr, stand.naechste_nummer);
}

async function lesePraefix(tx: DbZugriff, typ: NummernkreisTyp): Promise<string> {
  const zeilen = await tx.query<{ praefix: string }>(
    `SELECT ${PRAEFIX_SPALTE[typ]} AS praefix FROM einstellungen WHERE id = 1`,
  );
  return zeilen[0]?.praefix || STANDARD_PRAEFIXE[typ];
}
