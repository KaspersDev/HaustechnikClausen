import { DbZugriff } from '../../db/datenbank';
import {
  Auftrag,
  AuftragDaten,
  AuftragMitKunde,
  AuftragStatus,
  STATUS_TITEL,
  istStatuswechselErlaubt,
  pruefeAuftrag,
} from '../../domain/auftrag';
import { KundenTyp, kundenname } from '../../domain/kunde';
import { passtZurSuche } from '../../domain/suche';
import { AuftragRepository } from '../auftrag.repository';
import { RepoKontext } from './kontext';
import { vergibNummer } from './nummernvergabe';

interface AuftragZeile {
  id: string;
  nummer: string;
  kunde_id: string;
  titel: string;
  beschreibung: string;
  einsatzort_strasse: string;
  einsatzort_plz: string;
  einsatzort_ort: string;
  einsatzort_land: string;
  status: AuftragStatus;
  geplant_am: string | null;
  erledigt_am: string | null;
  rechnung_id: string | null;
  sortierung: number;
  erstellt_am: string;
  kunde_typ: KundenTyp;
  kunde_firma: string;
  kunde_name: string;
}

const SELECT = `
  SELECT a.*, k.typ AS kunde_typ, k.firma AS kunde_firma, k.name AS kunde_name
  FROM auftrag a JOIN kunde k ON k.id = a.kunde_id
  WHERE a.geloescht_am IS NULL`;

const ausZeile = (z: AuftragZeile): AuftragMitKunde => ({
  id: z.id,
  nummer: z.nummer,
  kundeId: z.kunde_id,
  titel: z.titel,
  beschreibung: z.beschreibung,
  einsatzort: {
    strasse: z.einsatzort_strasse,
    plz: z.einsatzort_plz,
    ort: z.einsatzort_ort,
    land: z.einsatzort_land,
  },
  status: z.status,
  geplantAm: z.geplant_am,
  erledigtAm: z.erledigt_am,
  rechnungId: z.rechnung_id,
  sortierung: z.sortierung,
  erstelltAm: z.erstellt_am,
  kundeName: kundenname({ typ: z.kunde_typ, firma: z.kunde_firma, name: z.kunde_name }),
});

function bereinigt(daten: AuftragDaten): AuftragDaten {
  const fehler = pruefeAuftrag(daten);
  if (fehler.length > 0) {
    throw new Error(fehler.join(' '));
  }
  return {
    kundeId: daten.kundeId,
    titel: daten.titel.trim(),
    beschreibung: daten.beschreibung.trim(),
    einsatzort: {
      strasse: daten.einsatzort.strasse.trim(),
      plz: daten.einsatzort.plz.trim(),
      ort: daten.einsatzort.ort.trim(),
      land: daten.einsatzort.land.trim(),
    },
    geplantAm: daten.geplantAm,
  };
}

async function finde(db: DbZugriff, id: string): Promise<AuftragMitKunde | null> {
  const [zeile] = await db.query<AuftragZeile>(`${SELECT} AND a.id = ?`, [id]);
  return zeile ? ausZeile(zeile) : null;
}

export class SqliteAuftragRepository implements AuftragRepository {
  constructor(private readonly kontext: RepoKontext) {}

  async alle(suche = ''): Promise<AuftragMitKunde[]> {
    const zeilen = await this.kontext.db.query<AuftragZeile>(
      `${SELECT} ORDER BY a.sortierung, a.nummer`,
    );
    return zeilen
      .map(ausZeile)
      .filter((a) =>
        passtZurSuche(suche, [
          a.nummer,
          a.titel,
          a.kundeName,
          a.einsatzort.ort,
          a.einsatzort.strasse,
        ]),
      );
  }

  finde(id: string): Promise<AuftragMitKunde | null> {
    return finde(this.kontext.db, id);
  }

  async anlegen(daten: AuftragDaten): Promise<Auftrag> {
    const d = bereinigt(daten);
    const id = this.kontext.neueId();
    const jetzt = this.kontext.jetzt();
    return this.kontext.db.transaction(async (tx) => {
      const nummer = await vergibNummer(tx, 'Auftrag', new Date(jetzt).getFullYear());
      const [ende] = await tx.query<{ naechste: number }>(
        `SELECT COALESCE(MAX(sortierung), -1) + 1 AS naechste FROM auftrag WHERE status = 'Offen'`,
      );
      await tx.run(
        `INSERT INTO auftrag (id, nummer, kunde_id, titel, beschreibung, einsatzort_strasse,
           einsatzort_plz, einsatzort_ort, einsatzort_land, status, geplant_am, sortierung,
           erstellt_am, geaendert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Offen', ?, ?, ?, ?)`,
        [
          id,
          nummer,
          d.kundeId,
          d.titel,
          d.beschreibung,
          d.einsatzort.strasse,
          d.einsatzort.plz,
          d.einsatzort.ort,
          d.einsatzort.land,
          d.geplantAm,
          ende.naechste,
          jetzt,
          jetzt,
        ],
      );
      return {
        ...d,
        id,
        nummer,
        status: 'Offen',
        erledigtAm: null,
        rechnungId: null,
        sortierung: ende.naechste,
        erstelltAm: jetzt,
      };
    });
  }

  async aendern(id: string, daten: AuftragDaten): Promise<Auftrag> {
    const d = bereinigt(daten);
    return this.kontext.db.transaction(async (tx) => {
      const vorher = await finde(tx, id);
      if (!vorher) {
        throw new Error('Der Auftrag wurde nicht gefunden.');
      }
      if (vorher.status === 'Abgerechnet') {
        throw new Error('Abgerechnete Aufträge können nicht mehr geändert werden.');
      }
      await tx.run(
        `UPDATE auftrag SET kunde_id = ?, titel = ?, beschreibung = ?, einsatzort_strasse = ?,
           einsatzort_plz = ?, einsatzort_ort = ?, einsatzort_land = ?, geplant_am = ?,
           geaendert_am = ? WHERE id = ?`,
        [
          d.kundeId,
          d.titel,
          d.beschreibung,
          d.einsatzort.strasse,
          d.einsatzort.plz,
          d.einsatzort.ort,
          d.einsatzort.land,
          d.geplantAm,
          this.kontext.jetzt(),
          id,
        ],
      );
      return (await finde(tx, id)) as Auftrag;
    });
  }

  verschiebe(id: string, status: AuftragStatus, index?: number): Promise<Auftrag> {
    return this.kontext.db.transaction(async (tx) => {
      const auftrag = await finde(tx, id);
      if (!auftrag) {
        throw new Error('Der Auftrag wurde nicht gefunden.');
      }
      if (auftrag.status !== status && !istStatuswechselErlaubt(auftrag.status, status)) {
        throw new Error(
          auftrag.status === 'Abgerechnet'
            ? 'Abgerechnete Aufträge können nicht mehr verschoben werden.'
            : `„${STATUS_TITEL.Abgerechnet}" entsteht nur durch das Festschreiben einer Rechnung.`,
        );
      }
      if (auftrag.status === 'Abgerechnet') {
        throw new Error('Abgerechnete Aufträge können nicht mehr verschoben werden.');
      }

      const jetzt = this.kontext.jetzt();
      const erledigtAm =
        status === 'Erledigt' ? (auftrag.status === 'Erledigt' ? auftrag.erledigtAm : jetzt) : null;
      await tx.run(
        'UPDATE auftrag SET status = ?, erledigt_am = ?, geaendert_am = ? WHERE id = ?',
        [status, erledigtAm, jetzt, id],
      );

      // Zielspalte neu durchnummerieren, den Auftrag an der gewünschten Stelle einfügen.
      const spalte = await tx.query<{ id: string }>(
        `SELECT id FROM auftrag WHERE status = ? AND id <> ? AND geloescht_am IS NULL
         ORDER BY sortierung, nummer`,
        [status, id],
      );
      const ids = spalte.map((z) => z.id);
      const position = Math.max(0, Math.min(index ?? ids.length, ids.length));
      ids.splice(position, 0, id);
      for (const [sortierung, auftragId] of ids.entries()) {
        await tx.run('UPDATE auftrag SET sortierung = ? WHERE id = ?', [sortierung, auftragId]);
      }
      return (await finde(tx, id)) as Auftrag;
    });
  }
}
