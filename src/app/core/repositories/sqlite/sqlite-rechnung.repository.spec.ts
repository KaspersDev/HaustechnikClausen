import { DbZugriff } from '../../db/datenbank';
import { LEERE_FIRMENDATEN } from '../../domain/firma';
import {
  Grunddaten,
  entwurfsdaten,
  legeAuftragAn,
  legeGrunddatenAn,
  pos,
} from '../../../testing/fixtures';
import { testKontext } from '../../../testing/test-datenbank';
import { RepoKontext } from './kontext';
import { SqliteArtikelRepository } from './sqlite-artikel.repository';
import { SqliteAuftragRepository } from './sqlite-auftrag.repository';
import { SqliteFirmendatenRepository } from './sqlite-firma.repository';
import { SqliteKundeRepository } from './sqlite-kunde.repository';
import { SqliteRechnungRepository } from './sqlite-rechnung.repository';

describe('SqliteRechnungRepository', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let repo: SqliteRechnungRepository;
  let auftraege: SqliteAuftragRepository;
  let daten: Grunddaten;
  let auftragId: string;

  const entwurf = (mehr = {}): ReturnType<typeof entwurfsdaten> =>
    entwurfsdaten(daten.kunde.id, auftragId, mehr);
  const naechsteNummer = async (): Promise<number> =>
    (
      await kontext.db.query<{ n: number }>(
        `SELECT COALESCE(MAX(naechste_nummer), 1) AS n FROM nummernkreis WHERE typ = 'Rechnung'`,
      )
    )[0].n;

  beforeEach(async () => {
    kontext = await testKontext();
    repo = new SqliteRechnungRepository(kontext);
    auftraege = new SqliteAuftragRepository(kontext);
    daten = await legeGrunddatenAn(kontext);
    auftragId = (await legeAuftragAn(kontext, daten.kunde.id)).id;
  });

  afterEach(() => kontext.db.close());

  describe('Entwurf', () => {
    it('hat keine Nummer und verbraucht keine', async () => {
      const r = await repo.entwurfAnlegen(entwurf());
      expect(r.status).toBe('Entwurf');
      expect(r.nummer).toBeNull();
      expect(await naechsteNummer()).toBe(1);
    });

    it('speichert Positionen in Reihenfolge und berechnet die Summen', async () => {
      const r = await repo.entwurfAnlegen(entwurf());
      expect(r.positionen.map((p) => [p.position, p.typ, p.beschreibung])).toEqual([
        [1, 'Arbeit', 'Zaun gesetzt'],
        [2, 'Material', 'Zaunlatte Lärche 180 cm'],
        [3, 'Anfahrt', 'Anfahrt Stadtgebiet'],
      ]);
      expect([r.summeNettoCent, r.summeMwstCent, r.summeBruttoCent]).toEqual([31440, 5974, 37414]);
      expect(r.empfaenger.name).toBe('Erika Müller');
      expect((await repo.finde(r.id))?.positionen).toHaveLength(3);
    });

    it('lässt sich ändern: Positionen werden ersetzt, Summen neu berechnet', async () => {
      const r = await repo.entwurfAnlegen(entwurf());
      const neu = await repo.entwurfAendern(
        r.id,
        entwurf({ positionen: [pos('Arbeit', 'Montage', 2, 5000)], faelligAm: '2026-04-09' }),
      );
      expect(neu.positionen.map((p) => p.beschreibung)).toEqual(['Montage']);
      expect(neu.summeBruttoCent).toBe(11900);
      expect(neu.faelligAm).toBe('2026-04-09');
    });

    it('lässt sich löschen und gibt den Auftrag wieder frei', async () => {
      const r = await repo.entwurfAnlegen(entwurf());
      await repo.entwurfLoeschen(r.id);
      expect(await repo.finde(r.id)).toBeNull();
      expect(await repo.alle()).toEqual([]);
      expect(await repo.fuerAuftrag(auftragId)).toBeNull();
      await expect(repo.entwurfAnlegen(entwurf())).resolves.toBeTruthy();
    });

    it('lehnt ungültige Entwürfe ab', async () => {
      await expect(repo.entwurfAnlegen(entwurf({ datum: '10.03.2026' }))).rejects.toThrow(
        /Rechnungsdatum/,
      );
      await expect(repo.entwurfAnlegen(entwurf({ faelligAm: '2026-03-01' }))).rejects.toThrow(
        /Fälligkeit/,
      );
      await expect(
        repo.entwurfAnlegen(entwurf({ positionen: [pos('Arbeit', ' ', 1, 100)] })),
      ).rejects.toThrow(/Position 1: Beschreibung/);
      await expect(
        repo.entwurfAnlegen(entwurf({ positionen: [pos('Arbeit', 'X', 1, 10.5)] })),
      ).rejects.toThrow(/Preis/);
      expect(await repo.alle()).toEqual([]);
    });

    it('erlaubt je Auftrag nur einen Entwurf', async () => {
      await repo.entwurfAnlegen(entwurf());
      await expect(repo.entwurfAnlegen(entwurf())).rejects.toThrow(/bereits eine Rechnung/);
      expect(await repo.alle()).toHaveLength(1);
    });

    it('rechnet nur erledigte Aufträge ab', async () => {
      await auftraege.verschiebe(auftragId, 'InArbeit');
      await expect(repo.entwurfAnlegen(entwurf())).rejects.toThrow(/Nur erledigte Aufträge/);
    });

    it('erlaubt Rechnungen ohne Auftrag', async () => {
      const r = await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, null));
      expect(r.auftragId).toBeNull();
    });
  });

  describe('Festschreiben', () => {
    it('vergibt die nächste Nummer, setzt „Versendet" und rechnet den Auftrag ab', async () => {
      const r = await repo.festschreiben((await repo.entwurfAnlegen(entwurf())).id);
      expect(r.nummer).toBe('RE-2026-0001');
      expect(r.status).toBe('Versendet');

      const auftrag = await auftraege.finde(auftragId);
      expect(auftrag?.status).toBe('Abgerechnet');
      expect(auftrag?.rechnungId).toBe(r.id);
      expect((await repo.fuerAuftrag(auftragId))?.id).toBe(r.id);
    });

    it('vergibt Nummern fortlaufend in der Reihenfolge des Festschreibens', async () => {
      const a = await repo.entwurfAnlegen(entwurf());
      const b = await repo.entwurfAnlegen(entwurfsdaten(daten.gewerbekunde.id, null));
      const c = await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, null));
      await repo.entwurfLoeschen(b.id);
      expect((await repo.festschreiben(c.id)).nummer).toBe('RE-2026-0001');
      expect((await repo.festschreiben(a.id)).nummer).toBe('RE-2026-0002');
    });

    it('nimmt das Jahr der Nummer aus dem Rechnungsdatum', async () => {
      const r = await repo.entwurfAnlegen(
        entwurfsdaten(daten.kunde.id, null, { datum: '2027-01-04', faelligAm: '2027-01-18' }),
      );
      expect((await repo.festschreiben(r.id)).nummer).toBe('RE-2027-0001');
    });

    it('speichert Summen, die den berechneten entsprechen', async () => {
      const r = await repo.festschreiben((await repo.entwurfAnlegen(entwurf())).id);
      expect([r.summeNettoCent, r.summeMwstCent, r.summeBruttoCent]).toEqual([31440, 5974, 37414]);
      expect(r.summeBruttoCent).toBe(r.summeNettoCent + r.summeMwstCent);
    });

    it('friert die Empfängeranschrift ein: spätere Kundenänderungen wirken nicht', async () => {
      const r = await repo.festschreiben((await repo.entwurfAnlegen(entwurf())).id);
      await new SqliteKundeRepository(kontext).aendern(daten.kunde.id, {
        ...daten.kunde,
        name: 'Erika Meier',
        strasse: 'Neue Straße 9',
      });
      const danach = await repo.finde(r.id);
      expect(danach?.empfaenger.name).toBe('Erika Müller');
      expect(danach?.empfaenger.strasse).toBe('Hafenweg 3');
    });

    it('übernimmt beim Festschreiben den aktuellen Stand des Kunden', async () => {
      const e = await repo.entwurfAnlegen(entwurf());
      await new SqliteKundeRepository(kontext).aendern(daten.kunde.id, {
        ...daten.kunde,
        strasse: 'Neue Straße 9',
      });
      expect((await repo.festschreiben(e.id)).empfaenger.strasse).toBe('Neue Straße 9');
    });

    it('bleibt von späteren Artikeländerungen unberührt', async () => {
      const e = await repo.entwurfAnlegen(
        entwurf({
          positionen: [pos('Material', 'Zaunlatte', 12, 895, { artikelId: daten.latte.id })],
        }),
      );
      const r = await repo.festschreiben(e.id);
      const artikel = new SqliteArtikelRepository(kontext);
      await artikel.aendern(daten.latte.id, {
        ...daten.latte,
        nettopreisCent: 1200,
        bezeichnung: 'Neu',
      });
      await artikel.loeschen(daten.latte.id);
      const danach = await repo.finde(r.id);
      expect(danach?.positionen[0]).toMatchObject({
        beschreibung: 'Zaunlatte',
        einzelpreisCent: 895,
      });
      expect(danach?.summeNettoCent).toBe(10740);
    });

    it('verlangt Positionen, vollständige Firmendaten und eine Kundenanschrift', async () => {
      const leer = await repo.entwurfAnlegen(entwurf({ positionen: [] }));
      await expect(repo.festschreiben(leer.id)).rejects.toThrow(/ohne Positionen/);
      await repo.entwurfLoeschen(leer.id);

      const e = await repo.entwurfAnlegen(entwurf());
      await new SqliteFirmendatenRepository(kontext).speichern(LEERE_FIRMENDATEN);
      await expect(repo.festschreiben(e.id)).rejects.toThrow(
        /Firmenname \(Einstellungen\), Anschrift \(Einstellungen\), Steuernummer oder USt-IdNr\./,
      );

      await legeGrunddatenAnFirma(kontext);
      await new SqliteKundeRepository(kontext).aendern(daten.kunde.id, { ...daten.kunde, plz: '' });
      await expect(repo.festschreiben(e.id)).rejects.toThrow(/Anschrift des Kunden/);
      expect((await repo.finde(e.id))?.status).toBe('Entwurf');
      expect(await naechsteNummer()).toBe(1);
    });

    it('verweigert das Festschreiben, wenn der Auftrag nicht mehr erledigt ist', async () => {
      const e = await repo.entwurfAnlegen(entwurf());
      await auftraege.verschiebe(auftragId, 'InArbeit');
      await expect(repo.festschreiben(e.id)).rejects.toThrow(/Nur erledigte Aufträge/);
    });

    it('hinterlässt bei einem Fehler mittendrin weder Nummer noch Teilzustand', async () => {
      const e = await repo.entwurfAnlegen(entwurf());
      const kaputt = new SqliteRechnungRepository(
        mitFehlerBei(kontext, /UPDATE auftrag SET status = 'Abgerechnet'/),
      );
      await expect(kaputt.festschreiben(e.id)).rejects.toThrow('Simulierter Fehler');

      const danach = await repo.finde(e.id);
      expect(danach?.status).toBe('Entwurf');
      expect(danach?.nummer).toBeNull();
      expect((await auftraege.finde(auftragId))?.status).toBe('Erledigt');
      expect(await naechsteNummer()).toBe(1);
      expect((await repo.festschreiben(e.id)).nummer).toBe('RE-2026-0001');
    });
  });

  describe('festgeschriebene Rechnung', () => {
    let id: string;

    beforeEach(async () => {
      id = (await repo.festschreiben((await repo.entwurfAnlegen(entwurf())).id)).id;
    });

    it('lässt sich über das Repository nicht mehr ändern oder löschen', async () => {
      await expect(repo.entwurfAendern(id, entwurf())).rejects.toThrow(/unveränderlich/);
      await expect(repo.entwurfLoeschen(id)).rejects.toThrow(/unveränderlich/);
      await expect(repo.festschreiben(id)).rejects.toThrow(/unveränderlich/);
      expect((await repo.finde(id))?.positionen).toHaveLength(3);
    });

    it('ist auch an der Datenbank vorbei nicht änderbar (Trigger)', async () => {
      await expect(
        kontext.db.run('UPDATE rechnung SET summe_brutto_cent = 1 WHERE id = ?', [id]),
      ).rejects.toThrow(/unveränderlich/);
      await expect(
        kontext.db.run('UPDATE rechnungsposition SET menge = 1 WHERE rechnung_id = ?', [id]),
      ).rejects.toThrow(/unveränderlich/);
      await expect(kontext.db.run('DELETE FROM rechnung WHERE id = ?', [id])).rejects.toThrow(
        /nicht gelöscht/,
      );
    });

    it('lässt sich als bezahlt markieren – genau einmal', async () => {
      expect((await repo.alsBezahltMarkieren(id)).status).toBe('Bezahlt');
      await expect(repo.alsBezahltMarkieren(id)).rejects.toThrow(/Nur versendete/);
    });

    it('verhindert eine zweite Rechnung zum selben Auftrag', async () => {
      await expect(repo.entwurfAnlegen(entwurf())).rejects.toThrow();
    });
  });

  describe('Storno', () => {
    let original: string;

    beforeEach(async () => {
      original = (await repo.festschreiben((await repo.entwurfAnlegen(entwurf())).id)).id;
    });

    it('erzeugt eine Stornorechnung mit eigener Nummer und negativen Beträgen', async () => {
      kontext.uhr.zeit = '2026-03-20T10:00:00.000Z';
      const storno = await repo.stornieren(original);
      expect(storno.nummer).toBe('RE-2026-0002');
      expect(storno.stornoVonRechnungId).toBe(original);
      expect(storno.status).toBe('Versendet');
      expect(storno.datum).toBe('2026-03-20');
      expect([storno.summeNettoCent, storno.summeMwstCent, storno.summeBruttoCent]).toEqual([
        -31440, -5974, -37414,
      ]);
      expect(storno.positionen.map((p) => p.menge)).toEqual([-3.5, -12, -1]);
      expect(storno.positionen.map((p) => p.einzelpreisCent)).toEqual([5200, 895, 2500]);
      expect(storno.empfaenger).toEqual((await repo.finde(original))?.empfaenger);
    });

    it('setzt das Original auf „Storniert" und den Auftrag zurück auf „Erledigt"', async () => {
      await repo.stornieren(original);
      expect((await repo.finde(original))?.status).toBe('Storniert');
      const auftrag = await auftraege.finde(auftragId);
      expect(auftrag?.status).toBe('Erledigt');
      expect(auftrag?.rechnungId).toBeNull();
      expect(await repo.fuerAuftrag(auftragId)).toBeNull();
    });

    it('lässt den Auftrag danach neu abrechnen', async () => {
      await repo.stornieren(original);
      const neu = await repo.festschreiben((await repo.entwurfAnlegen(entwurf())).id);
      expect(neu.nummer).toBe('RE-2026-0003');
      expect((await auftraege.finde(auftragId))?.rechnungId).toBe(neu.id);
    });

    it('storniert auch bezahlte Rechnungen', async () => {
      await repo.alsBezahltMarkieren(original);
      await repo.stornieren(original);
      expect((await repo.finde(original))?.status).toBe('Storniert');
    });

    it('lässt Original und Stornorechnung unveränderlich', async () => {
      const storno = await repo.stornieren(original);
      await expect(repo.stornieren(original)).rejects.toThrow(/bereits storniert/);
      await expect(repo.stornieren(storno.id)).rejects.toThrow(/Stornorechnung/);
      await expect(repo.alsBezahltMarkieren(storno.id)).rejects.toThrow(/Stornorechnung/);
      await expect(repo.entwurfAendern(storno.id, entwurf())).rejects.toThrow(/unveränderlich/);
    });

    it('storniert keine Entwürfe', async () => {
      const e = await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, null));
      await expect(repo.stornieren(e.id)).rejects.toThrow(/Entwurf/);
    });

    it('rollt bei einem Fehler vollständig zurück', async () => {
      const kaputt = new SqliteRechnungRepository(
        mitFehlerBei(kontext, /UPDATE rechnung SET status = 'Storniert'/),
      );
      await expect(kaputt.stornieren(original)).rejects.toThrow('Simulierter Fehler');
      expect((await repo.finde(original))?.status).toBe('Versendet');
      expect(await repo.alle()).toHaveLength(1);
      expect(await naechsteNummer()).toBe(2);
    });
  });

  describe('Liste', () => {
    it('zeigt Entwürfe zuerst, dann nach Nummer absteigend, und filtert', async () => {
      const a = await repo.festschreiben((await repo.entwurfAnlegen(entwurf())).id);
      const b = await repo.festschreiben(
        (await repo.entwurfAnlegen(entwurfsdaten(daten.gewerbekunde.id, null))).id,
      );
      await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, null));
      await repo.alsBezahltMarkieren(a.id);

      expect((await repo.alle()).map((r) => r.nummer)).toEqual([
        null,
        'RE-2026-0002',
        'RE-2026-0001',
      ]);
      expect((await repo.alle({ status: 'Bezahlt' })).map((r) => r.id)).toEqual([a.id]);
      expect((await repo.alle({ suche: 'backerei' })).map((r) => r.id)).toEqual([b.id]);
      expect((await repo.alle({ suche: '0001' })).map((r) => r.id)).toEqual([a.id]);
    });
  });
});

async function legeGrunddatenAnFirma(kontext: RepoKontext): Promise<void> {
  const { TEST_FIRMA } = await import('../../../testing/fixtures');
  await new SqliteFirmendatenRepository(kontext).speichern(TEST_FIRMA);
}

/** Kontext, dessen Transaktionen bei einer bestimmten Anweisung scheitern. */
function mitFehlerBei(kontext: RepoKontext, muster: RegExp): RepoKontext {
  const pruefe = (sql: string): void => {
    if (muster.test(sql.replace(/\s+/g, ' '))) {
      throw new Error('Simulierter Fehler');
    }
  };
  return {
    ...kontext,
    db: {
      ...kontext.db,
      run: (sql, p) => kontext.db.run(sql, p),
      query: (sql, p) => kontext.db.query(sql, p),
      execute: (sql) => kontext.db.execute(sql),
      exportieren: () => kontext.db.exportieren(),
      close: () => kontext.db.close(),
      transaction: (arbeit) =>
        kontext.db.transaction((tx) => {
          const tx2: DbZugriff = {
            run: async (sql, p) => {
              pruefe(sql);
              return tx.run(sql, p);
            },
            query: (sql, p) => tx.query(sql, p),
            execute: (sql) => tx.execute(sql),
          };
          return arbeit(tx2);
        }),
    },
  };
}
