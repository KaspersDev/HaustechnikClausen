import { DbZugriff, SqlWert } from '../../db/datenbank';
import { tagVon } from '../../domain/datum';
import { Firmendaten, fehlendeFirmenangaben } from '../../domain/firma';
import { KundenTyp, fehlendeRechnungsangaben } from '../../domain/kunde';
import {
  Empfaenger,
  Rechnung,
  RechnungEntwurfDaten,
  RechnungKopf,
  RechnungStatus,
  Rechnungsposition,
  RechnungspositionDaten,
  istStornorechnung,
  pruefeEntwurf,
  summenVon,
} from '../../domain/rechnung';
import { passtZurSuche } from '../../domain/suche';
import { PositionsTyp } from '../../domain/typen';
import { RechnungFilter, RechnungRepository } from '../rechnung.repository';
import { RepoKontext } from './kontext';
import { vergibNummer } from './nummernvergabe';

interface RechnungZeile {
  id: string;
  nummer: string | null;
  kunde_id: string;
  auftrag_id: string | null;
  datum: string;
  faellig_am: string;
  leistungsdatum: string;
  status: RechnungStatus;
  summe_netto_cent: number;
  summe_mwst_cent: number;
  summe_brutto_cent: number;
  empf_typ: KundenTyp;
  empf_firma: string;
  empf_name: string;
  empf_strasse: string;
  empf_plz: string;
  empf_ort: string;
  empf_land: string;
  empf_ust_id: string;
  storno_von_rechnung_id: string | null;
}

interface PositionZeile {
  id: string;
  artikel_id: string | null;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis_cent: number;
  mwst_satz: number;
  typ: PositionsTyp;
  position: number;
}

const kopfAusZeile = (z: RechnungZeile): RechnungKopf => ({
  id: z.id,
  nummer: z.nummer,
  kundeId: z.kunde_id,
  auftragId: z.auftrag_id,
  datum: z.datum,
  faelligAm: z.faellig_am,
  leistungsdatum: z.leistungsdatum,
  status: z.status,
  summeNettoCent: z.summe_netto_cent,
  summeMwstCent: z.summe_mwst_cent,
  summeBruttoCent: z.summe_brutto_cent,
  empfaenger: {
    typ: z.empf_typ,
    firma: z.empf_firma,
    name: z.empf_name,
    strasse: z.empf_strasse,
    plz: z.empf_plz,
    ort: z.empf_ort,
    land: z.empf_land,
    ustId: z.empf_ust_id,
  },
  stornoVonRechnungId: z.storno_von_rechnung_id,
});

const positionAusZeile = (z: PositionZeile): Rechnungsposition => ({
  id: z.id,
  artikelId: z.artikel_id,
  beschreibung: z.beschreibung,
  menge: z.menge,
  einheit: z.einheit,
  einzelpreisCent: z.einzelpreis_cent,
  mwstSatz: z.mwst_satz,
  typ: z.typ,
  position: z.position,
});

function geprueft(daten: RechnungEntwurfDaten): RechnungEntwurfDaten {
  const fehler = pruefeEntwurf(daten);
  if (fehler.length > 0) {
    throw new Error(fehler.join(' '));
  }
  return daten;
}

export class SqliteRechnungRepository implements RechnungRepository {
  constructor(private readonly kontext: RepoKontext) {}

  async alle(filter: RechnungFilter = {}): Promise<RechnungKopf[]> {
    const zeilen = await this.kontext.db.query<RechnungZeile>(
      `SELECT * FROM rechnung WHERE geloescht_am IS NULL
       ORDER BY nummer IS NOT NULL, nummer DESC, erstellt_am DESC`,
    );
    return zeilen
      .map(kopfAusZeile)
      .filter((r) => !filter.status || r.status === filter.status)
      .filter((r) =>
        passtZurSuche(filter.suche ?? '', [
          r.nummer ?? '',
          r.empfaenger.firma,
          r.empfaenger.name,
          r.empfaenger.ort,
        ]),
      );
  }

  finde(id: string): Promise<Rechnung | null> {
    return this.lies(this.kontext.db, id);
  }

  async fuerAuftrag(auftragId: string): Promise<RechnungKopf | null> {
    const zeile = await this.gueltigeFuerAuftrag(this.kontext.db, auftragId);
    return zeile ? kopfAusZeile(zeile) : null;
  }

  async entwurfAnlegen(daten: RechnungEntwurfDaten): Promise<Rechnung> {
    const d = geprueft(daten);
    const id = this.kontext.neueId();
    const jetzt = this.kontext.jetzt();
    return this.kontext.db.transaction(async (tx) => {
      if (d.auftragId) {
        await this.pruefeAuftragAbrechenbar(tx, d.auftragId);
        if (await this.gueltigeFuerAuftrag(tx, d.auftragId)) {
          throw new Error('Zu diesem Auftrag gibt es bereits eine Rechnung oder einen Entwurf.');
        }
      }
      const empfaenger = await this.leseEmpfaenger(tx, d.kundeId);
      const summen = summenVon(d.positionen);
      await tx.run(
        `INSERT INTO rechnung (id, kunde_id, auftrag_id, datum, faellig_am, leistungsdatum, status,
           summe_netto_cent, summe_mwst_cent, summe_brutto_cent, empf_typ, empf_firma, empf_name,
           empf_strasse, empf_plz, empf_ort, empf_land, empf_ust_id, erstellt_am, geaendert_am)
         VALUES (?, ?, ?, ?, ?, ?, 'Entwurf', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          d.kundeId,
          d.auftragId,
          d.datum,
          d.faelligAm,
          d.leistungsdatum,
          summen.nettoCent,
          summen.mwstCent,
          summen.bruttoCent,
          ...empfaengerWerte(empfaenger),
          jetzt,
          jetzt,
        ],
      );
      await this.schreibePositionen(tx, id, d.positionen);
      return this.liesSicher(tx, id);
    });
  }

  async entwurfAendern(id: string, daten: RechnungEntwurfDaten): Promise<Rechnung> {
    const d = geprueft(daten);
    return this.kontext.db.transaction(async (tx) => {
      await this.liesEntwurf(tx, id);
      const empfaenger = await this.leseEmpfaenger(tx, d.kundeId);
      const summen = summenVon(d.positionen);
      await tx.run(
        `UPDATE rechnung SET kunde_id = ?, datum = ?, faellig_am = ?, leistungsdatum = ?,
           summe_netto_cent = ?, summe_mwst_cent = ?, summe_brutto_cent = ?, empf_typ = ?,
           empf_firma = ?, empf_name = ?, empf_strasse = ?, empf_plz = ?, empf_ort = ?,
           empf_land = ?, empf_ust_id = ?, geaendert_am = ? WHERE id = ?`,
        [
          d.kundeId,
          d.datum,
          d.faelligAm,
          d.leistungsdatum,
          summen.nettoCent,
          summen.mwstCent,
          summen.bruttoCent,
          ...empfaengerWerte(empfaenger),
          this.kontext.jetzt(),
          id,
        ],
      );
      await tx.run('DELETE FROM rechnungsposition WHERE rechnung_id = ?', [id]);
      await this.schreibePositionen(tx, id, d.positionen);
      return this.liesSicher(tx, id);
    });
  }

  async entwurfLoeschen(id: string): Promise<void> {
    await this.kontext.db.transaction(async (tx) => {
      await this.liesEntwurf(tx, id);
      const jetzt = this.kontext.jetzt();
      await tx.run('UPDATE rechnung SET geloescht_am = ?, geaendert_am = ? WHERE id = ?', [
        jetzt,
        jetzt,
        id,
      ]);
    });
  }

  festschreiben(id: string): Promise<Rechnung> {
    return this.kontext.db.transaction(async (tx) => {
      const entwurf = await this.liesEntwurf(tx, id);
      if (entwurf.positionen.length === 0) {
        throw new Error('Eine Rechnung ohne Positionen kann nicht festgeschrieben werden.');
      }
      const fehlend = [
        ...fehlendeFirmenangaben(await this.leseFirma(tx)).map((f) => `${f} (Einstellungen)`),
        ...fehlendeRechnungsangaben(await this.leseEmpfaenger(tx, entwurf.kundeId)),
      ];
      if (fehlend.length > 0) {
        throw new Error(`Für die Rechnung fehlen Angaben: ${fehlend.join(', ')}.`);
      }
      if (entwurf.auftragId) {
        await this.pruefeAuftragAbrechenbar(tx, entwurf.auftragId);
      }

      const empfaenger = await this.leseEmpfaenger(tx, entwurf.kundeId);
      const summen = summenVon(entwurf.positionen);
      const nummer = await vergibNummer(tx, 'Rechnung', Number(entwurf.datum.slice(0, 4)));
      const jetzt = this.kontext.jetzt();
      await tx.run(
        `UPDATE rechnung SET status = 'Versendet', nummer = ?, summe_netto_cent = ?,
           summe_mwst_cent = ?, summe_brutto_cent = ?, empf_typ = ?, empf_firma = ?,
           empf_name = ?, empf_strasse = ?, empf_plz = ?, empf_ort = ?, empf_land = ?,
           empf_ust_id = ?, geaendert_am = ? WHERE id = ?`,
        [
          nummer,
          summen.nettoCent,
          summen.mwstCent,
          summen.bruttoCent,
          ...empfaengerWerte(empfaenger),
          jetzt,
          id,
        ],
      );
      if (entwurf.auftragId) {
        const [ende] = await tx.query<{ naechste: number }>(
          `SELECT COALESCE(MAX(sortierung), -1) + 1 AS naechste FROM auftrag
           WHERE status = 'Abgerechnet'`,
        );
        await tx.run(
          `UPDATE auftrag SET status = 'Abgerechnet', rechnung_id = ?, sortierung = ?,
             geaendert_am = ? WHERE id = ?`,
          [id, ende.naechste, jetzt, entwurf.auftragId],
        );
      }
      return this.liesSicher(tx, id);
    });
  }

  alsBezahltMarkieren(id: string): Promise<Rechnung> {
    return this.kontext.db.transaction(async (tx) => {
      const rechnung = await this.liesSicher(tx, id);
      if (istStornorechnung(rechnung)) {
        throw new Error('Eine Stornorechnung kann nicht als bezahlt markiert werden.');
      }
      if (rechnung.status !== 'Versendet') {
        throw new Error('Nur versendete Rechnungen können als bezahlt markiert werden.');
      }
      await tx.run(`UPDATE rechnung SET status = 'Bezahlt', geaendert_am = ? WHERE id = ?`, [
        this.kontext.jetzt(),
        id,
      ]);
      return this.liesSicher(tx, id);
    });
  }

  stornieren(id: string): Promise<Rechnung> {
    return this.kontext.db.transaction(async (tx) => {
      const original = await this.liesSicher(tx, id);
      if (istStornorechnung(original)) {
        throw new Error('Eine Stornorechnung kann nicht storniert werden.');
      }
      if (original.status === 'Entwurf') {
        throw new Error('Ein Entwurf wird gelöscht, nicht storniert.');
      }
      if (original.status === 'Storniert') {
        throw new Error('Die Rechnung ist bereits storniert.');
      }

      const jetzt = this.kontext.jetzt();
      const heute = tagVon(new Date(jetzt));
      const stornoId = this.kontext.neueId();
      const positionen = original.positionen.map((p) => ({ ...p, menge: -p.menge }));
      const summen = summenVon(positionen);

      // Als Entwurf anlegen, Positionen schreiben, dann festschreiben (Trigger-konform).
      await tx.run(
        `INSERT INTO rechnung (id, kunde_id, auftrag_id, datum, faellig_am, leistungsdatum, status,
           summe_netto_cent, summe_mwst_cent, summe_brutto_cent, empf_typ, empf_firma, empf_name,
           empf_strasse, empf_plz, empf_ort, empf_land, empf_ust_id, storno_von_rechnung_id,
           erstellt_am, geaendert_am)
         VALUES (?, ?, ?, ?, ?, ?, 'Entwurf', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stornoId,
          original.kundeId,
          original.auftragId,
          heute,
          heute,
          original.leistungsdatum,
          summen.nettoCent,
          summen.mwstCent,
          summen.bruttoCent,
          ...empfaengerWerte(original.empfaenger),
          original.id,
          jetzt,
          jetzt,
        ],
      );
      await this.schreibePositionen(tx, stornoId, positionen);
      const nummer = await vergibNummer(tx, 'Rechnung', Number(heute.slice(0, 4)));
      await tx.run(`UPDATE rechnung SET status = 'Versendet', nummer = ? WHERE id = ?`, [
        nummer,
        stornoId,
      ]);

      await tx.run(`UPDATE rechnung SET status = 'Storniert', geaendert_am = ? WHERE id = ?`, [
        jetzt,
        id,
      ]);
      if (original.auftragId) {
        const [ende] = await tx.query<{ naechste: number }>(
          `SELECT COALESCE(MAX(sortierung), -1) + 1 AS naechste FROM auftrag
           WHERE status = 'Erledigt'`,
        );
        await tx.run(
          `UPDATE auftrag SET status = 'Erledigt', rechnung_id = NULL, sortierung = ?,
             geaendert_am = ? WHERE id = ? AND rechnung_id = ?`,
          [ende.naechste, jetzt, original.auftragId, id],
        );
      }
      return this.liesSicher(tx, stornoId);
    });
  }

  private async lies(db: DbZugriff, id: string): Promise<Rechnung | null> {
    const [zeile] = await db.query<RechnungZeile>(
      'SELECT * FROM rechnung WHERE id = ? AND geloescht_am IS NULL',
      [id],
    );
    if (!zeile) {
      return null;
    }
    const positionen = await db.query<PositionZeile>(
      'SELECT * FROM rechnungsposition WHERE rechnung_id = ? ORDER BY position',
      [id],
    );
    return { ...kopfAusZeile(zeile), positionen: positionen.map(positionAusZeile) };
  }

  private async liesSicher(db: DbZugriff, id: string): Promise<Rechnung> {
    const rechnung = await this.lies(db, id);
    if (!rechnung) {
      throw new Error('Die Rechnung wurde nicht gefunden.');
    }
    return rechnung;
  }

  private async liesEntwurf(db: DbZugriff, id: string): Promise<Rechnung> {
    const rechnung = await this.liesSicher(db, id);
    if (rechnung.status !== 'Entwurf') {
      throw new Error(
        'Festgeschriebene Rechnungen sind unveränderlich; möglich ist nur ein Storno.',
      );
    }
    return rechnung;
  }

  /** Entwurf oder gültige (nicht stornierte) Rechnung zu einem Auftrag; Stornorechnungen zählen nicht. */
  private async gueltigeFuerAuftrag(
    db: DbZugriff,
    auftragId: string,
  ): Promise<RechnungZeile | null> {
    const [zeile] = await db.query<RechnungZeile>(
      `SELECT * FROM rechnung WHERE auftrag_id = ? AND geloescht_am IS NULL
         AND status <> 'Storniert' AND storno_von_rechnung_id IS NULL`,
      [auftragId],
    );
    return zeile ?? null;
  }

  private async pruefeAuftragAbrechenbar(db: DbZugriff, auftragId: string): Promise<void> {
    const [auftrag] = await db.query<{ status: string }>(
      'SELECT status FROM auftrag WHERE id = ? AND geloescht_am IS NULL',
      [auftragId],
    );
    if (!auftrag) {
      throw new Error('Der Auftrag wurde nicht gefunden.');
    }
    if (auftrag.status !== 'Erledigt') {
      throw new Error('Nur erledigte Aufträge können abgerechnet werden.');
    }
  }

  private async leseEmpfaenger(db: DbZugriff, kundeId: string): Promise<Empfaenger> {
    const [k] = await db.query<{
      typ: KundenTyp;
      firma: string;
      name: string;
      strasse: string;
      plz: string;
      ort: string;
      land: string;
      ust_id: string;
    }>('SELECT typ, firma, name, strasse, plz, ort, land, ust_id FROM kunde WHERE id = ?', [
      kundeId,
    ]);
    if (!k) {
      throw new Error('Der Kunde wurde nicht gefunden.');
    }
    return {
      typ: k.typ,
      firma: k.firma,
      name: k.name,
      strasse: k.strasse,
      plz: k.plz,
      ort: k.ort,
      land: k.land,
      ustId: k.ust_id,
    };
  }

  private async leseFirma(db: DbZugriff): Promise<Firmendaten> {
    const [f] = await db.query<{
      name: string;
      strasse: string;
      plz: string;
      ort: string;
      steuernummer: string;
      ust_id: string;
    }>('SELECT name, strasse, plz, ort, steuernummer, ust_id FROM firmendaten WHERE id = 1');
    return {
      name: f?.name ?? '',
      strasse: f?.strasse ?? '',
      plz: f?.plz ?? '',
      ort: f?.ort ?? '',
      steuernummer: f?.steuernummer ?? '',
      ustId: f?.ust_id ?? '',
      land: '',
      telefon: '',
      email: '',
      bankInhaber: '',
      bankIban: '',
      bankBic: '',
      bankName: '',
      logo: null,
    };
  }

  private async schreibePositionen(
    tx: DbZugriff,
    rechnungId: string,
    positionen: readonly RechnungspositionDaten[],
  ): Promise<void> {
    for (const [index, p] of positionen.entries()) {
      await tx.run(
        `INSERT INTO rechnungsposition (id, rechnung_id, artikel_id, beschreibung, menge, einheit,
           einzelpreis_cent, mwst_satz, typ, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.kontext.neueId(),
          rechnungId,
          p.artikelId,
          p.beschreibung.trim(),
          p.menge,
          p.einheit.trim(),
          p.einzelpreisCent,
          p.mwstSatz,
          p.typ,
          index + 1,
        ],
      );
    }
  }
}

function empfaengerWerte(e: Empfaenger): SqlWert[] {
  return [e.typ, e.firma, e.name, e.strasse, e.plz, e.ort, e.land, e.ustId];
}
