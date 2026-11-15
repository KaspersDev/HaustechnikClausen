import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { LEERER_KUNDE, Kunde } from '../../core/domain/kunde';
import { AUFTRAG_REPOSITORY, AuftragRepository } from '../../core/repositories/auftrag.repository';
import { KUNDE_REPOSITORY } from '../../core/repositories/kunde.repository';
import { testKontext } from '../../testing/test-datenbank';
import { provideTestUmgebung } from '../../testing/test-providers';
import { AuftragDetailPage } from './auftrag-detail.page';

describe('AuftragDetailPage', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let fixture: ComponentFixture<AuftragDetailPage>;
  let seite: AuftragDetailPage;
  let repo: AuftragRepository;
  let erika: Kunde;
  let hansen: Kunde;
  let el: HTMLElement;
  let navigiert: unknown[][];
  const route = { snapshot: { paramMap: convertToParamMap({}) } };

  async function oeffnen(id: string | null): Promise<void> {
    route.snapshot = { paramMap: convertToParamMap(id ? { id } : {}) };
    fixture = TestBed.createComponent(AuftragDetailPage);
    seite = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    await seite.geladen;
    await fixture.whenStable();
  }

  beforeEach(async () => {
    kontext = await testKontext();
    TestBed.configureTestingModule({
      providers: [provideTestUmgebung(kontext), { provide: ActivatedRoute, useValue: route }],
    });
    repo = TestBed.inject(AUFTRAG_REPOSITORY);
    const kunden = TestBed.inject(KUNDE_REPOSITORY);
    erika = await kunden.anlegen({
      ...LEERER_KUNDE,
      name: 'Erika Müller',
      strasse: 'Hafenweg 3',
      plz: '24103',
      ort: 'Kiel',
    });
    hansen = await kunden.anlegen({ ...LEERER_KUNDE, typ: 'Gewerbe', firma: 'Hansen GmbH' });
    navigiert = [];
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(async (...args) => {
      navigiert.push(args);
      return true;
    });
  });

  afterEach(() => kontext.db.close());

  describe('neuer Auftrag', () => {
    beforeEach(() => oeffnen(null));

    it('bietet die Kunden zur Auswahl an', () => {
      const treffer = Array.from(el.querySelectorAll('.kundentreffer h3')).map((h) =>
        h.textContent?.trim(),
      );
      expect(treffer).toEqual(['Erika Müller', 'Hansen GmbH']);
    });

    it('filtert die Kundenauswahl über die Suche', async () => {
      await seite.sucheKunden('hans');
      expect(seite.kundenTreffer().map((k) => k.id)).toEqual([hansen.id]);
    });

    it('verlangt Kunde und Titel', async () => {
      expect(await seite.speichern()).toBe(false);
      expect(seite.fehler()).toEqual(['Kunde: bitte auswählen', 'Titel: bitte ausfüllen']);
      expect(await repo.alle()).toEqual([]);
    });

    it('legt den Auftrag an, übernimmt den Einsatzort vom Kunden und öffnet ihn', async () => {
      seite.waehleKunde(erika);
      seite.form.patchValue({ titel: 'Zaun reparieren', geplantAm: '2026-03-20' });
      expect(await seite.speichern()).toBe(true);

      const [auftrag] = await repo.alle();
      expect(auftrag.nummer).toBe('AU-2026-0001');
      expect(auftrag.kundeId).toBe(erika.id);
      expect(auftrag.geplantAm).toBe('2026-03-20');
      expect(auftrag.einsatzort).toEqual({
        strasse: 'Hafenweg 3',
        plz: '24103',
        ort: 'Kiel',
        land: 'Deutschland',
      });
      expect(navigiert).toEqual([[['/auftraege', auftrag.id], { replaceUrl: true }]]);
    });

    it('speichert einen abweichenden Einsatzort', async () => {
      seite.waehleKunde(erika);
      seite.form.patchValue({
        titel: 'Trockenbau',
        einsatzortWieKunde: false,
        strasse: 'Am Markt 1',
        plz: '23552',
        ort: 'Lübeck',
      });
      await fixture.whenStable();
      expect(el.querySelector('ion-input[formControlName="strasse"]')).not.toBeNull();
      expect(await seite.speichern()).toBe(true);
      expect((await repo.alle())[0].einsatzort.ort).toBe('Lübeck');
    });

    it('prüft die PLZ des Einsatzorts', async () => {
      seite.waehleKunde(erika);
      seite.form.patchValue({ titel: 'Trockenbau', einsatzortWieKunde: false, plz: '12' });
      expect(await seite.speichern()).toBe(false);
      expect(seite.fehler()).toEqual(['PLZ: ungültige Postleitzahl']);
    });
  });

  describe('bestehender Auftrag', () => {
    let id: string;

    beforeEach(async () => {
      id = (
        await repo.anlegen({
          kundeId: erika.id,
          titel: 'Zaun reparieren',
          beschreibung: '12 m Lärche',
          einsatzort: { strasse: 'Hafenweg 3', plz: '24103', ort: 'Kiel', land: 'Deutschland' },
          geplantAm: null,
        })
      ).id;
      await oeffnen(id);
    });

    it('zeigt Nummer, Kunde und Daten', () => {
      expect(el.querySelector('ion-title')?.textContent).toContain(
        'AU-2026-0001 · Zaun reparieren',
      );
      expect(el.querySelector('.kunde-name')?.textContent).toContain('Erika Müller');
      expect(seite.form.getRawValue().beschreibung).toBe('12 m Lärche');
      expect(seite.form.getRawValue().einsatzortWieKunde).toBe(true);
      expect(el.querySelector('.kundentreffer')).toBeNull();
    });

    it('speichert Änderungen einschließlich Kundenwechsel', async () => {
      await seite.oeffneKundenwahl();
      seite.waehleKunde(hansen);
      seite.form.patchValue({ titel: 'Zaun und Tor' });
      expect(await seite.speichern()).toBe(true);
      const auftrag = await repo.finde(id);
      expect(auftrag?.titel).toBe('Zaun und Tor');
      expect(auftrag?.kundeId).toBe(hansen.id);
      expect(navigiert).toEqual([]);
    });

    it('wechselt den Status und zeigt das Erledigt-Datum', async () => {
      await seite.setzeStatus('Erledigt');
      await fixture.whenStable();
      expect((await repo.finde(id))?.status).toBe('Erledigt');
      expect(el.querySelector('.status-zeile')?.textContent).toContain('Erledigt am 10.03.2026');
    });

    it('bietet „Abgerechnet" nicht zur Auswahl an', () => {
      const werte = Array.from(el.querySelectorAll('ion-segment-button')).map((b) =>
        b.textContent?.trim(),
      );
      expect(werte).toEqual(['Offen', 'In Arbeit', 'Erledigt']);
    });

    it('sperrt abgerechnete Aufträge', async () => {
      await kontext.db.run(`UPDATE auftrag SET status = 'Abgerechnet' WHERE id = ?`, [id]);
      await oeffnen(id);
      expect(seite.form.disabled).toBe(true);
      expect(el.querySelector('ion-button.speichern')).toBeNull();
      expect(el.querySelector('ion-segment')).toBeNull();
      expect(el.querySelector('.abgerechnet')?.textContent).toContain('abgerechnet');
    });
  });

  it('meldet einen unbekannten Auftrag', async () => {
    await oeffnen('gibt-es-nicht');
    expect(seite.fehler()).toEqual(['Der Auftrag wurde nicht gefunden.']);
  });
});
