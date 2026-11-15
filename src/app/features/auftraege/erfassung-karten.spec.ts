import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LEERER_KUNDE } from '../../core/domain/kunde';
import { ARTIKEL_REPOSITORY } from '../../core/repositories/artikel.repository';
import { AUFTRAG_REPOSITORY } from '../../core/repositories/auftrag.repository';
import {
  MATERIALEINTRAG_REPOSITORY,
  ZEITEINTRAG_REPOSITORY,
} from '../../core/repositories/erfassung.repository';
import { KUNDE_REPOSITORY } from '../../core/repositories/kunde.repository';
import { testKontext } from '../../testing/test-datenbank';
import { provideTestUmgebung } from '../../testing/test-providers';
import { MaterialKarte } from './material-karte';
import { ZeitenKarte } from './zeiten-karte';

describe('Erfassung am Auftrag', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let auftragId: string;

  const texte = (el: HTMLElement, selektor: string): string[] =>
    Array.from(el.querySelectorAll(selektor)).map(
      (e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

  beforeEach(async () => {
    kontext = await testKontext();
    TestBed.configureTestingModule({ providers: [provideTestUmgebung(kontext)] });
    const kunde = await TestBed.inject(KUNDE_REPOSITORY).anlegen({ ...LEERER_KUNDE, name: 'M' });
    auftragId = (
      await TestBed.inject(AUFTRAG_REPOSITORY).anlegen({
        kundeId: kunde.id,
        titel: 'Zaun',
        beschreibung: '',
        einsatzort: { strasse: '', plz: '', ort: '', land: '' },
        geplantAm: null,
      })
    ).id;
  });

  afterEach(() => kontext.db.close());

  describe('ZeitenKarte', () => {
    let fixture: ComponentFixture<ZeitenKarte>;
    let karte: ZeitenKarte;
    let el: HTMLElement;

    async function erzeugen(gesperrt = false): Promise<void> {
      fixture = TestBed.createComponent(ZeitenKarte);
      fixture.componentRef.setInput('auftragId', auftragId);
      fixture.componentRef.setInput('gesperrt', gesperrt);
      karte = fixture.componentInstance;
      el = fixture.nativeElement as HTMLElement;
      await fixture.whenStable();
      await karte.geladen;
      await fixture.whenStable();
    }

    const erfasse = async (
      von: string,
      bis: string,
      pause = 0,
      taetigkeit = '',
    ): Promise<boolean> => {
      karte.form.patchValue({ tag: '2026-03-10', von, bis, pauseMinuten: pause, taetigkeit });
      const ok = await karte.speichern();
      await fixture.whenStable();
      return ok;
    };

    it('schlägt das heutige Datum vor', async () => {
      await erzeugen();
      expect(karte.form.getRawValue().tag).toBe('2026-03-10');
      expect(el.querySelector('.hinweis')?.textContent).toContain('Noch keine Zeiten');
    });

    it('erfasst Zeiten und zeigt Dauer und Summe', async () => {
      await erzeugen();
      expect(await erfasse('08:00', '12:30', 30, 'Pfosten gesetzt')).toBe(true);
      expect(await erfasse('13:00', '15:15')).toBe(true);
      expect(texte(el, '.eintrag ion-note')).toEqual(['4:00 h', '2:15 h']);
      expect(texte(el, '.eintrag h3')[0]).toBe('10.03.2026, 08:00–12:30');
      expect(texte(el, '.eintrag p')[0]).toBe('Pfosten gesetzt · 30 min Pause');
      expect(texte(el, '.summe')).toEqual(['Summe: 6:15 h']);
      expect(karte.form.getRawValue().von).toBe('');
    });

    it('lehnt ein Ende vor dem Start und fehlende Angaben ab', async () => {
      await erzeugen();
      expect(await erfasse('12:00', '08:00')).toBe(false);
      expect(karte.fehler()).toEqual(['Das Ende muss nach dem Start liegen.']);
      expect(await erfasse('', '')).toBe(false);
      expect(karte.fehler()).toEqual(['Von: bitte ausfüllen', 'Bis: bitte ausfüllen']);
      expect(await erfasse('08:00', '09:00', 90)).toBe(false);
      expect(karte.fehler()).toEqual(['Die Pause ist länger als die erfasste Zeit.']);
      expect(karte.eintraege()).toEqual([]);
    });

    it('ändert und löscht einen Eintrag', async () => {
      await erzeugen();
      await erfasse('08:00', '10:00');
      karte.bearbeite(karte.eintraege()[0]);
      expect(karte.form.getRawValue()).toMatchObject({ von: '08:00', bis: '10:00' });
      await erfasse('08:00', '11:00');
      expect(texte(el, '.eintrag ion-note')).toEqual(['3:00 h']);

      karte.bearbeite(karte.eintraege()[0]);
      await karte.loeschen();
      await fixture.whenStable();
      expect(karte.eintraege()).toEqual([]);
    });

    it('zeigt bei abgerechneten Aufträgen nur die Liste', async () => {
      await TestBed.inject(ZEITEINTRAG_REPOSITORY).anlegen(auftragId, {
        start: '2026-03-10T07:00:00.000Z',
        ende: '2026-03-10T09:00:00.000Z',
        pauseMinuten: 0,
        taetigkeit: '',
      });
      await kontext.db.run(`UPDATE auftrag SET status = 'Abgerechnet' WHERE id = ?`, [auftragId]);
      await erzeugen(true);
      expect(texte(el, '.eintrag ion-note')).toEqual(['2:00 h']);
      expect(el.querySelector('form')).toBeNull();
      expect(el.querySelector('.hinzufuegen')).toBeNull();
      karte.bearbeite(karte.eintraege()[0]);
      expect(karte.bearbeitet()).toBeNull();
    });
  });

  describe('MaterialKarte', () => {
    let fixture: ComponentFixture<MaterialKarte>;
    let karte: MaterialKarte;
    let el: HTMLElement;

    async function erzeugen(gesperrt = false): Promise<void> {
      fixture = TestBed.createComponent(MaterialKarte);
      fixture.componentRef.setInput('auftragId', auftragId);
      fixture.componentRef.setInput('gesperrt', gesperrt);
      karte = fixture.componentInstance;
      el = fixture.nativeElement as HTMLElement;
      await fixture.whenStable();
      await karte.geladen;
      await fixture.whenStable();
    }

    beforeEach(async () => {
      const artikel = TestBed.inject(ARTIKEL_REPOSITORY);
      await artikel.anlegen({
        bezeichnung: 'Zaunlatte',
        einheit: 'Stk',
        nettopreisCent: 895,
        mwstSatz: 19,
        typ: 'Material',
      });
      await artikel.anlegen({
        bezeichnung: 'Anfahrt Stadtgebiet',
        einheit: 'pauschal',
        nettopreisCent: 2500,
        mwstSatz: 19,
        typ: 'Anfahrt',
      });
    });

    it('bietet Artikel zur Auswahl an und filtert sie über die Suche', async () => {
      await erzeugen();
      expect(texte(el, '.artikeltreffer h3')).toEqual(['Anfahrt Stadtgebiet', 'Zaunlatte']);
      await karte.sucheArtikel('latte');
      await fixture.whenStable();
      expect(texte(el, '.artikeltreffer h3')).toEqual(['Zaunlatte']);
    });

    it('übernimmt den Artikelpreis als Vorschlag', async () => {
      await erzeugen();
      karte.waehleArtikel(karte.treffer()[1]);
      expect(karte.form.getRawValue()).toEqual({ menge: '1', preis: '8,95' });
    });

    it('erfasst Material und Anfahrt und zeigt Beträge und Summe', async () => {
      await erzeugen();
      karte.waehleArtikel(karte.treffer()[1]);
      karte.form.patchValue({ menge: '12' });
      expect(await karte.speichern()).toBe(true);
      karte.waehleArtikel(karte.treffer()[0]);
      expect(await karte.speichern()).toBe(true);
      await fixture.whenStable();

      expect(texte(el, '.eintrag ion-note')).toEqual(['107,40 €', '25,00 €']);
      expect(texte(el, '.eintrag p')).toEqual([
        '12 Stk × 8,95 € · Material',
        '1 pauschal × 25,00 € · Anfahrt',
      ]);
      expect(texte(el, '.summe')).toEqual(['Summe netto: 132,40 €']);
    });

    it('speichert einen für den Auftrag geänderten Preis und Dezimalmengen', async () => {
      await erzeugen();
      karte.waehleArtikel(karte.treffer()[1]);
      karte.form.patchValue({ menge: '2,5', preis: '8,00' });
      await karte.speichern();
      const [eintrag] = await TestBed.inject(MATERIALEINTRAG_REPOSITORY).fuerAuftrag(auftragId);
      expect(eintrag).toMatchObject({ menge: 2.5, einzelpreisCent: 800 });
    });

    it('prüft Menge und Preis', async () => {
      await erzeugen();
      karte.waehleArtikel(karte.treffer()[1]);
      karte.form.patchValue({ menge: '0', preis: 'abc' });
      expect(await karte.speichern()).toBe(false);
      expect(karte.fehler()).toEqual(['Menge: ungültige Menge', 'Einzelpreis: ungültiger Betrag']);
      expect(karte.eintraege()).toEqual([]);
    });

    it('ändert und löscht einen Eintrag', async () => {
      await erzeugen();
      karte.waehleArtikel(karte.treffer()[1]);
      await karte.speichern();
      karte.bearbeite(karte.eintraege()[0]);
      karte.form.patchValue({ menge: '3' });
      await karte.speichern();
      expect(karte.eintraege()[0].menge).toBe(3);

      karte.bearbeite(karte.eintraege()[0]);
      await karte.loeschen();
      expect(karte.eintraege()).toEqual([]);
    });

    it('zeigt bei abgerechneten Aufträgen nur die Liste', async () => {
      const [artikel] = await TestBed.inject(ARTIKEL_REPOSITORY).alle({ suche: 'latte' });
      await TestBed.inject(MATERIALEINTRAG_REPOSITORY).anlegen(auftragId, {
        artikelId: artikel.id,
        menge: 2,
        einzelpreisCent: 895,
      });
      await kontext.db.run(`UPDATE auftrag SET status = 'Abgerechnet' WHERE id = ?`, [auftragId]);
      await erzeugen(true);
      expect(texte(el, '.eintrag ion-note')).toEqual(['17,90 €']);
      expect(el.querySelector('ion-searchbar')).toBeNull();
      expect(el.querySelector('.artikeltreffer')).toBeNull();
    });
  });
});
