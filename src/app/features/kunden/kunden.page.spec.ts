import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LEERER_KUNDE } from '../../core/domain/kunde';
import { KUNDE_REPOSITORY, KundeRepository } from '../../core/repositories/kunde.repository';
import { testKontext } from '../../testing/test-datenbank';
import { TestDialoge, provideTestUmgebung } from '../../testing/test-providers';
import { KundenPage } from './kunden.page';

describe('KundenPage', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let fixture: ComponentFixture<KundenPage>;
  let seite: KundenPage;
  let repo: KundeRepository;
  let dialoge: TestDialoge;
  let el: HTMLElement;

  const namen = (): string[] =>
    Array.from(el.querySelectorAll('.split-liste ion-item h2')).map(
      (h) => h.textContent?.trim() ?? '',
    );

  beforeEach(async () => {
    kontext = await testKontext();
    TestBed.configureTestingModule({ providers: [provideTestUmgebung(kontext)] });
    repo = TestBed.inject(KUNDE_REPOSITORY);
    dialoge = TestBed.inject(TestDialoge);
    await repo.anlegen({ ...LEERER_KUNDE, name: 'Erika Müller', ort: 'Kiel' });
    await repo.anlegen({ ...LEERER_KUNDE, typ: 'Gewerbe', firma: 'Hansen GmbH', ort: 'Lübeck' });

    fixture = TestBed.createComponent(KundenPage);
    seite = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    await seite.geladen;
    await fixture.whenStable();
  });

  afterEach(() => kontext.db.close());

  it('listet die Kunden sortiert auf', () => {
    expect(namen()).toEqual(['Erika Müller', 'Hansen GmbH']);
    expect(el.querySelector('.split-detail .leer')).not.toBeNull();
  });

  it('filtert die Liste über die Suche', async () => {
    await seite.setzeSuche('lubeck');
    await fixture.whenStable();
    expect(namen()).toEqual(['Hansen GmbH']);

    await seite.setzeSuche('gibt es nicht');
    await fixture.whenStable();
    expect(namen()).toEqual([]);
    expect(el.querySelector('.split-liste .leer')?.textContent).toContain('Keine Kunden gefunden');
  });

  it('öffnet einen Kunden zum Bearbeiten', async () => {
    (el.querySelectorAll('.split-liste ion-item')[1] as HTMLElement).click();
    await fixture.whenStable();
    expect(seite.form.getRawValue().firma).toBe('Hansen GmbH');
    expect(el.querySelector('.split-detail h2')?.textContent).toContain('Hansen GmbH');
    expect(el.querySelector('ion-input[formControlName="firma"]')).not.toBeNull();
  });

  it('zeigt Firma und USt-IdNr. nur bei Gewerbekunden', async () => {
    seite.neu();
    await fixture.whenStable();
    expect(el.querySelector('ion-input[formControlName="firma"]')).toBeNull();
    expect(el.querySelector('ion-input[formControlName="ustId"]')).toBeNull();

    seite.form.controls.typ.setValue('Gewerbe');
    await fixture.whenStable();
    expect(el.querySelector('ion-input[formControlName="firma"]')).not.toBeNull();
    expect(el.querySelector('ion-input[formControlName="ustId"]')).not.toBeNull();
  });

  it('verlangt den Namen bei Privat- und die Firma bei Gewerbekunden', async () => {
    seite.neu();
    expect(await seite.speichern()).toBe(false);
    expect(seite.fehler()).toEqual(['Name: bitte ausfüllen']);

    seite.form.patchValue({ typ: 'Gewerbe', name: 'Ole Hansen' });
    expect(await seite.speichern()).toBe(false);
    expect(seite.fehler()).toEqual(['Firma: bitte ausfüllen']);
    expect(await repo.alle()).toHaveLength(2);
  });

  it('prüft PLZ und E-Mail', async () => {
    seite.neu();
    seite.form.patchValue({ name: 'Jens Petersen', plz: '123', email: 'jens@' });
    expect(await seite.speichern()).toBe(false);
    await fixture.whenStable();
    expect(seite.fehler()).toEqual([
      'PLZ: ungültige Postleitzahl',
      'E-Mail: ungültige E-Mail-Adresse',
    ]);
    expect(el.querySelectorAll('.fehlerliste li')).toHaveLength(2);
  });

  it('legt einen neuen Kunden an und zeigt ihn in der Liste', async () => {
    seite.neu();
    seite.form.patchValue({ name: 'Jens Petersen', plz: '24103', ort: 'Kiel' });
    expect(await seite.speichern()).toBe(true);
    await fixture.whenStable();
    expect(namen()).toEqual(['Erika Müller', 'Hansen GmbH', 'Jens Petersen']);
    expect(dialoge.erfolge).toEqual(['Kunde gespeichert']);
    expect(seite.auswahl()).toMatchObject({ name: 'Jens Petersen' });
  });

  it('speichert Änderungen an einem bestehenden Kunden', async () => {
    seite.waehle(seite.kunden()[0]);
    seite.form.patchValue({ telefon: '0431 5555' });
    expect(await seite.speichern()).toBe(true);
    expect((await repo.alle('müller'))[0].telefon).toBe('0431 5555');
    expect(await repo.alle()).toHaveLength(2);
  });

  it('löscht erst nach Bestätigung', async () => {
    seite.waehle(seite.kunden()[0]);
    dialoge.antwort = false;
    await seite.loeschen();
    expect(await repo.alle()).toHaveLength(2);

    dialoge.antwort = true;
    await seite.loeschen();
    await fixture.whenStable();
    expect(namen()).toEqual(['Hansen GmbH']);
    expect(seite.auswahl()).toBeNull();
    expect(dialoge.fragen).toEqual(['Kunden löschen?', 'Kunden löschen?']);
  });

  it('zeigt eine Meldung, wenn der Kunde wegen Aufträgen nicht gelöscht werden kann', async () => {
    const kunde = seite.kunden()[0];
    await kontext.db.run(
      `INSERT INTO auftrag (id, nummer, kunde_id, titel, status, erstellt_am, geaendert_am)
       VALUES ('a1', 'AU-2026-0001', ?, 'Zaun', 'Offen', ?, ?)`,
      [kunde.id, kontext.jetzt(), kontext.jetzt()],
    );
    seite.waehle(kunde);
    await seite.loeschen();
    expect(seite.fehler()[0]).toContain('Aufträge oder Rechnungen');
    expect(await repo.alle()).toHaveLength(2);
  });
});
