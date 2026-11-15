import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { AUFTRAG_REPOSITORY } from '../../core/repositories/auftrag.repository';
import {
  RECHNUNG_REPOSITORY,
  RechnungRepository,
} from '../../core/repositories/rechnung.repository';
import { Grunddaten, entwurfsdaten, legeAuftragAn, legeGrunddatenAn } from '../../testing/fixtures';
import { testKontext } from '../../testing/test-datenbank';
import { TestDialoge, provideTestUmgebung } from '../../testing/test-providers';
import { AuftragDetailPage } from '../auftraege/auftrag-detail.page';
import { RechnungDetailPage } from './rechnung-detail.page';
import { RechnungenPage } from './rechnungen.page';

describe('Rechnungen', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let repo: RechnungRepository;
  let dialoge: TestDialoge;
  let daten: Grunddaten;
  let auftragId: string;
  let navigate: ReturnType<typeof vi.spyOn>;
  const route = { snapshot: { paramMap: convertToParamMap({}) } };

  const texte = (el: HTMLElement, selektor: string): string[] =>
    Array.from(el.querySelectorAll(selektor)).map(
      (e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

  beforeEach(async () => {
    kontext = await testKontext();
    TestBed.configureTestingModule({
      providers: [provideTestUmgebung(kontext), { provide: ActivatedRoute, useValue: route }],
    });
    repo = TestBed.inject(RECHNUNG_REPOSITORY);
    dialoge = TestBed.inject(TestDialoge);
    daten = await legeGrunddatenAn(kontext);
    auftragId = (await legeAuftragAn(kontext, daten.kunde.id)).id;
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => kontext.db.close());

  describe('RechnungDetailPage', () => {
    let fixture: ComponentFixture<RechnungDetailPage>;
    let seite: RechnungDetailPage;
    let el: HTMLElement;
    let id: string;

    async function oeffnen(rechnungId: string): Promise<void> {
      route.snapshot = { paramMap: convertToParamMap({ id: rechnungId }) };
      fixture = TestBed.createComponent(RechnungDetailPage);
      seite = fixture.componentInstance;
      el = fixture.nativeElement as HTMLElement;
      await seite.geladen;
      await fixture.whenStable();
    }

    beforeEach(async () => {
      id = (await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, auftragId))).id;
      await oeffnen(id);
    });

    it('zeigt den Entwurf mit Empfänger, Positionen und getrennten Summen', () => {
      expect(el.querySelector('ion-title')?.textContent).toContain('Rechnungsentwurf');
      expect(el.querySelector('.empfaenger')?.textContent).toContain('Erika Müller');
      expect(el.querySelector('.empfaenger')?.textContent).toContain('Hafenweg 3, 24103 Kiel');
      expect(seite.positionen.length).toBe(3);
      expect(texte(el, '.zeilenbetrag')).toEqual(['182,00 €', '107,40 €', '25,00 €']);
      expect(texte(el, '.summen dt')).toEqual([
        'Arbeit',
        'Material',
        'Anfahrt',
        'Summe netto',
        'MwSt 19 %',
        'Gesamt brutto',
      ]);
      expect(texte(el, '.summen dd')).toEqual([
        '182,00 €',
        '107,40 €',
        '25,00 €',
        '314,40 €',
        '59,74 €',
        '374,14 €',
      ]);
    });

    it('rechnet die Summen bei Änderungen sofort neu', async () => {
      seite.positionen.at(0).patchValue({ menge: '4', preis: '60,00' });
      await fixture.whenStable();
      expect(texte(el, '.zeilenbetrag')[0]).toBe('240,00 €');
      expect(texte(el, '.summen .netto')).toEqual(['372,40 €']);
      expect(texte(el, '.summen .brutto')).toEqual(['443,16 €']);

      seite.entferne(1);
      await fixture.whenStable();
      expect(texte(el, '.summen dt')).not.toContain('Material');
      expect(texte(el, '.summen .netto')).toEqual(['265,00 €']);
    });

    it('weist gemischte Steuersätze getrennt aus', async () => {
      seite.positionen.at(1).patchValue({ mwstSatz: 7 });
      await fixture.whenStable();
      expect(texte(el, '.summen dt')).toContain('MwSt 7 %');
      expect(texte(el, '.summen dt')).toContain('MwSt 19 %');
    });

    it('ergänzt, sortiert und speichert Positionen', async () => {
      seite.neuePosition();
      seite.positionen.at(3).patchValue({
        typ: 'Material',
        beschreibung: 'Schrauben',
        menge: '2,5',
        einheit: 'kg',
        preis: '4,20',
      });
      seite.verschiebe(3, -1);
      expect(await seite.speichern()).toBe(true);

      const gespeichert = await repo.finde(id);
      expect(gespeichert?.positionen.map((p) => p.beschreibung)).toEqual([
        'Zaun gesetzt',
        'Zaunlatte Lärche 180 cm',
        'Schrauben',
        'Anfahrt Stadtgebiet',
      ]);
      expect(gespeichert?.positionen[2]).toMatchObject({
        menge: 2.5,
        einzelpreisCent: 420,
        einheit: 'kg',
      });
      expect(gespeichert?.summeNettoCent).toBe(32490);
    });

    it('meldet ungültige Positionen und speichert dann nicht', async () => {
      seite.positionen.at(0).patchValue({ beschreibung: ' ', menge: 'viel', preis: '1,234' });
      expect(await seite.speichern()).toBe(false);
      expect(seite.fehler()).toEqual([
        'Position 1: Beschreibung fehlt',
        'Position 1: ungültige Menge',
        'Position 1: ungültiger Preis',
      ]);
      expect((await repo.finde(id))?.positionen[0].beschreibung).toBe('Zaun gesetzt');
    });

    it('speichert geänderte Daten', async () => {
      seite.form.patchValue({ faelligAm: '2026-04-30' });
      await seite.speichern();
      expect((await repo.finde(id))?.faelligAm).toBe('2026-04-30');
    });

    it('schreibt erst nach Bestätigung fest und zeigt die Rechnung dann schreibgeschützt', async () => {
      dialoge.antwort = false;
      await seite.festschreiben();
      expect((await repo.finde(id))?.status).toBe('Entwurf');
      expect(dialoge.fragen).toEqual(['Rechnung festschreiben?']);

      dialoge.antwort = true;
      seite.positionen.at(0).patchValue({ menge: '4' });
      await seite.festschreiben();
      await fixture.whenStable();

      const rechnung = await repo.finde(id);
      expect(rechnung?.status).toBe('Versendet');
      expect(rechnung?.nummer).toBe('RE-2026-0001');
      expect(rechnung?.positionen[0].menge).toBe(4);
      expect(el.querySelector('ion-title')?.textContent).toContain('Rechnung RE-2026-0001');
      expect(el.querySelector('form')).toBeNull();
      expect(el.querySelector('.festschreiben')).toBeNull();
      expect(el.querySelector('.entwurf-loeschen')).toBeNull();
      expect(el.querySelectorAll('.positionstabelle tbody tr')).toHaveLength(3);
      expect(el.querySelector('.bezahlt')).not.toBeNull();
      expect(el.querySelector('.stornieren')).not.toBeNull();
      expect((await TestBed.inject(AUFTRAG_REPOSITORY).finde(auftragId))?.status).toBe(
        'Abgerechnet',
      );
    });

    it('zeigt eine klare Meldung, wenn Firmendaten fehlen', async () => {
      await kontext.db.run('DELETE FROM firmendaten');
      await seite.festschreiben();
      expect(seite.fehler()[0]).toContain('Firmenname (Einstellungen)');
      expect((await repo.finde(id))?.status).toBe('Entwurf');
    });

    it('markiert als bezahlt', async () => {
      await repo.festschreiben(id);
      await oeffnen(id);
      await seite.bezahlt();
      await fixture.whenStable();
      expect((await repo.finde(id))?.status).toBe('Bezahlt');
      expect(el.querySelector('.bezahlt')).toBeNull();
      expect(el.querySelector('.stornieren')).not.toBeNull();
    });

    it('storniert nach Bestätigung und zeigt das Original als storniert', async () => {
      await repo.festschreiben(id);
      await oeffnen(id);
      await seite.stornieren();
      await fixture.whenStable();
      expect(texte(el, '.status')).toEqual(['Storniert']);
      expect(el.querySelector('.stornieren')).toBeNull();
      expect(dialoge.erfolge).toEqual(['Storniert mit RE-2026-0002']);
      expect((await TestBed.inject(AUFTRAG_REPOSITORY).finde(auftragId))?.status).toBe('Erledigt');
    });

    it('zeigt eine Stornorechnung ohne Aktionen und mit negativen Beträgen', async () => {
      await repo.festschreiben(id);
      const storno = await repo.stornieren(id);
      await oeffnen(storno.id);
      expect(el.querySelector('ion-title')?.textContent).toContain('Stornorechnung RE-2026-0002');
      expect(texte(el, '.summen .brutto')).toEqual(['-374,14 €']);
      expect(el.querySelector('.bezahlt')).toBeNull();
      expect(el.querySelector('.stornieren')).toBeNull();
    });

    it('löscht den Entwurf nach Bestätigung und kehrt zur Liste zurück', async () => {
      await seite.loeschen();
      expect(await repo.finde(id)).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/rechnungen'], { replaceUrl: true });
    });

    it('meldet eine unbekannte Rechnung', async () => {
      await oeffnen('gibt-es-nicht');
      expect(seite.fehler()).toEqual(['Die Rechnung wurde nicht gefunden.']);
    });
  });

  describe('RechnungenPage', () => {
    let fixture: ComponentFixture<RechnungenPage>;
    let seite: RechnungenPage;
    let el: HTMLElement;

    beforeEach(async () => {
      const a = await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, auftragId));
      await repo.festschreiben(a.id);
      const b = await repo.entwurfAnlegen(entwurfsdaten(daten.gewerbekunde.id, null));
      await repo.festschreiben(b.id);
      await repo.alsBezahltMarkieren(b.id);
      await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, null));

      fixture = TestBed.createComponent(RechnungenPage);
      seite = fixture.componentInstance;
      el = fixture.nativeElement as HTMLElement;
      await seite.geladen;
      await fixture.whenStable();
    });

    it('listet Rechnungen mit Nummer, Status, Empfänger und Betrag', () => {
      expect(texte(el, '.rechnung h2')).toEqual([
        'Entwurf Entwurf',
        'RE-2026-0002 Bezahlt',
        'RE-2026-0001 Versendet',
      ]);
      expect(texte(el, '.rechnung p')[1]).toBe(
        'Bäckerei Hansen GmbH · 10.03.2026 · fällig 24.03.2026',
      );
      expect(texte(el, '.rechnung ion-note')[0]).toBe('374,14 €');
    });

    it('filtert nach Status und Suche', async () => {
      await seite.setzeStatus('Bezahlt');
      await fixture.whenStable();
      expect(texte(el, '.rechnung h2')).toEqual(['RE-2026-0002 Bezahlt']);

      await seite.setzeStatus('Alle');
      await seite.setzeSuche('muller');
      await fixture.whenStable();
      expect(texte(el, '.rechnung h2')).toEqual(['Entwurf Entwurf', 'RE-2026-0001 Versendet']);

      await seite.setzeStatus('Storniert');
      await fixture.whenStable();
      expect(el.querySelector('.leer')?.textContent).toContain('Keine Rechnungen gefunden');
    });

    it('öffnet eine Rechnung beim Antippen', () => {
      (el.querySelector('.rechnung') as HTMLElement).click();
      expect(navigate).toHaveBeenCalledWith(['/rechnungen', seite.rechnungen()[0].id]);
    });
  });

  describe('Einstieg aus dem Auftrag', () => {
    let fixture: ComponentFixture<AuftragDetailPage>;
    let seite: AuftragDetailPage;
    let el: HTMLElement;

    async function oeffnen(): Promise<void> {
      route.snapshot = { paramMap: convertToParamMap({ id: auftragId }) };
      fixture = TestBed.createComponent(AuftragDetailPage);
      seite = fixture.componentInstance;
      el = fixture.nativeElement as HTMLElement;
      await seite.geladen;
      await fixture.whenStable();
    }

    it('bietet „Rechnung erzeugen" nur bei erledigten Aufträgen an', async () => {
      await oeffnen();
      expect(el.querySelector('.rechnung-erzeugen')).not.toBeNull();
      await seite.setzeStatus('InArbeit');
      await fixture.whenStable();
      expect(el.querySelector('.rechnung-erzeugen')).toBeNull();
    });

    it('legt den Entwurf an und öffnet ihn', async () => {
      await oeffnen();
      await seite.rechnungErzeugen();
      const [entwurf] = await repo.alle();
      expect(entwurf.auftragId).toBe(auftragId);
      expect(navigate).toHaveBeenCalledWith(['/rechnungen', entwurf.id]);
    });

    it('zeigt bei abgerechneten Aufträgen den Weg zur Rechnung', async () => {
      const r = await repo.festschreiben(
        (await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, auftragId))).id,
      );
      await oeffnen();
      expect(el.querySelector('.rechnung-erzeugen')).toBeNull();
      (el.querySelector('.rechnung-anzeigen') as HTMLElement).click();
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith(['/rechnungen', r.id]);
    });

    it('zeigt den Fehler, wenn der Stundensatz fehlt', async () => {
      await kontext.db.run('UPDATE einstellungen SET standard_stundensatz_artikel_id = NULL');
      await kontext.db.run(`UPDATE auftrag SET status = 'InArbeit' WHERE id = ?`, [auftragId]);
      await kontext.db.run(
        `INSERT INTO zeiteintrag (id, auftrag_id, start, ende, erstellt_am, geaendert_am)
         VALUES ('z', ?, '2026-03-10T07:00:00.000Z', '2026-03-10T09:00:00.000Z', 'x', 'x')`,
        [auftragId],
      );
      await kontext.db.run(`UPDATE auftrag SET status = 'Erledigt' WHERE id = ?`, [auftragId]);
      await oeffnen();
      await seite.rechnungErzeugen();
      expect(seite.fehler()[0]).toContain('Standard-Stundensatz');
      expect(await repo.alle()).toEqual([]);
    });
  });
});
