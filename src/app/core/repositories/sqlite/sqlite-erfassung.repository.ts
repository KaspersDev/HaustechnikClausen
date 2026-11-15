import { DbZugriff } from '../../db/datenbank';
import {
  Materialeintrag,
  MaterialeintragDaten,
  Zeiteintrag,
  ZeiteintragDaten,
  pruefeMaterialeintrag,
  pruefeZeiteintrag,
} from '../../domain/erfassung';
import { PositionsTyp } from '../../domain/typen';
import { MaterialeintragRepository, ZeiteintragRepository } from '../erfassung.repository';
import { RepoKontext } from './kontext';

type Tabelle = 'zeiteintrag' | 'materialeintrag';

/** Wirft, wenn der Auftrag fehlt oder bereits abgerechnet ist. */
async function pruefeAuftragOffen(tx: DbZugriff, auftragId: string): Promise<void> {
  const [auftrag] = await tx.query<{ status: string }>(
    'SELECT status FROM auftrag WHERE id = ? AND geloescht_am IS NULL',
    [auftragId],
  );
  if (!auftrag) {
    throw new Error('Der Auftrag wurde nicht gefunden.');
  }
  if (auftrag.status === 'Abgerechnet') {
    throw new Error('Der Auftrag ist abgerechnet; Zeiten und Material sind gesperrt.');
  }
}

async function auftragVon(tx: DbZugriff, tabelle: Tabelle, id: string): Promise<string> {
  const [zeile] = await tx.query<{ auftrag_id: string }>(
    `SELECT auftrag_id FROM ${tabelle} WHERE id = ? AND geloescht_am IS NULL`,
    [id],
  );
  if (!zeile) {
    throw new Error('Der Eintrag wurde nicht gefunden.');
  }
  return zeile.auftrag_id;
}

async function loesche(kontext: RepoKontext, tabelle: Tabelle, id: string): Promise<void> {
  await kontext.db.transaction(async (tx) => {
    await pruefeAuftragOffen(tx, await auftragVon(tx, tabelle, id));
    const jetzt = kontext.jetzt();
    await tx.run(`UPDATE ${tabelle} SET geloescht_am = ?, geaendert_am = ? WHERE id = ?`, [
      jetzt,
      jetzt,
      id,
    ]);
  });
}

function geprueft<T>(daten: T, fehler: string[]): T {
  if (fehler.length > 0) {
    throw new Error(fehler.join(' '));
  }
  return daten;
}

interface ZeitZeile {
  id: string;
  auftrag_id: string;
  start: string;
  ende: string;
  pause_minuten: number;
  taetigkeit: string;
}

const zeitAusZeile = (z: ZeitZeile): Zeiteintrag => ({
  id: z.id,
  auftragId: z.auftrag_id,
  start: z.start,
  ende: z.ende,
  pauseMinuten: z.pause_minuten,
  taetigkeit: z.taetigkeit,
});

export class SqliteZeiteintragRepository implements ZeiteintragRepository {
  constructor(private readonly kontext: RepoKontext) {}

  async fuerAuftrag(auftragId: string): Promise<Zeiteintrag[]> {
    const zeilen = await this.kontext.db.query<ZeitZeile>(
      `SELECT * FROM zeiteintrag WHERE auftrag_id = ? AND geloescht_am IS NULL
       ORDER BY start, erstellt_am`,
      [auftragId],
    );
    return zeilen.map(zeitAusZeile);
  }

  async anlegen(auftragId: string, daten: ZeiteintragDaten): Promise<Zeiteintrag> {
    const d = geprueft(daten, pruefeZeiteintrag(daten));
    const id = this.kontext.neueId();
    const jetzt = this.kontext.jetzt();
    await this.kontext.db.transaction(async (tx) => {
      await pruefeAuftragOffen(tx, auftragId);
      await tx.run(
        `INSERT INTO zeiteintrag (id, auftrag_id, start, ende, pause_minuten, taetigkeit,
           erstellt_am, geaendert_am) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, auftragId, d.start, d.ende, d.pauseMinuten, d.taetigkeit.trim(), jetzt, jetzt],
      );
    });
    return { ...d, taetigkeit: d.taetigkeit.trim(), id, auftragId };
  }

  async aendern(id: string, daten: ZeiteintragDaten): Promise<Zeiteintrag> {
    const d = geprueft(daten, pruefeZeiteintrag(daten));
    return this.kontext.db.transaction(async (tx) => {
      const auftragId = await auftragVon(tx, 'zeiteintrag', id);
      await pruefeAuftragOffen(tx, auftragId);
      await tx.run(
        `UPDATE zeiteintrag SET start = ?, ende = ?, pause_minuten = ?, taetigkeit = ?,
           geaendert_am = ? WHERE id = ?`,
        [d.start, d.ende, d.pauseMinuten, d.taetigkeit.trim(), this.kontext.jetzt(), id],
      );
      return { ...d, taetigkeit: d.taetigkeit.trim(), id, auftragId };
    });
  }

  loeschen(id: string): Promise<void> {
    return loesche(this.kontext, 'zeiteintrag', id);
  }
}

interface MaterialZeile {
  id: string;
  auftrag_id: string;
  artikel_id: string;
  menge: number;
  einzelpreis_cent: number;
  bezeichnung: string;
  einheit: string;
  mwst_satz: number;
  typ: PositionsTyp;
}

const MATERIAL_SELECT = `
  SELECT m.id, m.auftrag_id, m.artikel_id, m.menge, m.einzelpreis_cent,
         a.bezeichnung, a.einheit, a.mwst_satz, a.typ
  FROM materialeintrag m JOIN artikel a ON a.id = m.artikel_id
  WHERE m.geloescht_am IS NULL`;

const materialAusZeile = (z: MaterialZeile): Materialeintrag => ({
  id: z.id,
  auftragId: z.auftrag_id,
  artikelId: z.artikel_id,
  menge: z.menge,
  einzelpreisCent: z.einzelpreis_cent,
  bezeichnung: z.bezeichnung,
  einheit: z.einheit,
  mwstSatz: z.mwst_satz,
  typ: z.typ,
});

export class SqliteMaterialeintragRepository implements MaterialeintragRepository {
  constructor(private readonly kontext: RepoKontext) {}

  async fuerAuftrag(auftragId: string): Promise<Materialeintrag[]> {
    const zeilen = await this.kontext.db.query<MaterialZeile>(
      `${MATERIAL_SELECT} AND m.auftrag_id = ? ORDER BY m.erstellt_am, m.rowid`,
      [auftragId],
    );
    return zeilen.map(materialAusZeile);
  }

  async anlegen(auftragId: string, daten: MaterialeintragDaten): Promise<Materialeintrag> {
    const d = geprueft(daten, pruefeMaterialeintrag(daten));
    const id = this.kontext.neueId();
    const jetzt = this.kontext.jetzt();
    return this.kontext.db.transaction(async (tx) => {
      await pruefeAuftragOffen(tx, auftragId);
      await tx.run(
        `INSERT INTO materialeintrag (id, auftrag_id, artikel_id, menge, einzelpreis_cent,
           erstellt_am, geaendert_am) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, auftragId, d.artikelId, d.menge, d.einzelpreisCent, jetzt, jetzt],
      );
      return this.lies(tx, id);
    });
  }

  async aendern(id: string, daten: MaterialeintragDaten): Promise<Materialeintrag> {
    const d = geprueft(daten, pruefeMaterialeintrag(daten));
    return this.kontext.db.transaction(async (tx) => {
      await pruefeAuftragOffen(tx, await auftragVon(tx, 'materialeintrag', id));
      await tx.run(
        `UPDATE materialeintrag SET artikel_id = ?, menge = ?, einzelpreis_cent = ?,
           geaendert_am = ? WHERE id = ?`,
        [d.artikelId, d.menge, d.einzelpreisCent, this.kontext.jetzt(), id],
      );
      return this.lies(tx, id);
    });
  }

  loeschen(id: string): Promise<void> {
    return loesche(this.kontext, 'materialeintrag', id);
  }

  private async lies(tx: DbZugriff, id: string): Promise<Materialeintrag> {
    const [zeile] = await tx.query<MaterialZeile>(`${MATERIAL_SELECT} AND m.id = ?`, [id]);
    return materialAusZeile(zeile);
  }
}
