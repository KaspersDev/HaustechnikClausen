import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ARTIKEL_REPOSITORY, ArtikelRepository } from '../../core/repositories/artikel.repository';
import { EINSTELLUNGEN_REPOSITORY } from '../../core/repositories/firma.repository';
import { testKontext } from '../../testing/test-datenbank';
import { TestDialoge, provideTestUmgebung } from '../../testing/test-providers';
import { ArtikelPage } from './artikel.page';

describe('ArtikelPage', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let fixture: ComponentFixture<ArtikelPage>;
  let seite: ArtikelPage;
  let repo: ArtikelRepository;
  let el: HTMLElement;

  const namen = (): string[] =>
    Array.from(el.querySelectorAll('.split-liste ion-item h2')).map(
      (h) => h.textContent?.trim() ?? '',
    );
  const stundensatz = async (): Promise<string | null> =>
    (await TestBed.inject(EINSTELLUNGEN_REPOSITORY).laden()).standardStundensatzArtikelId;

  beforeEach(async () => {
    kontext = await testKontext();
    TestBed.configureTestingModule({ providers: [provideTestUmgebung(kontext)] });
    repo = TestBed.inject(ARTIKEL_REPOSITORY);
    await repo.anlegen({
      bezeichnung: 'Monteurstunde',
      einheit: 'Std',
      nettopreisCent: 5800,
      mwstSatz: 19,
      typ: 'Arbeit',
    });
    await repo.anlegen({
      bezeichnung: 'Zaunlatte Lärche',
      einheit: 'Stk',
      nettopreisCent: 895,
      mwstSatz: 19,
      typ: 'Material',
    });
    fixture = TestBed.createComponent(ArtikelPage);
    seite = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    await seite.geladen;
    await fixture.whenStable();
  });

  afterEach(() => kontext.db.close());

  it('listet Artikel mit Preis und Einheit', () => {
    expect(namen()).toEqual(['Monteurstunde', 'Zaunlatte Lärche']);
    const preise = Array.from(el.querySelectorAll('.split-liste ion-note')).map((n) =>
      n.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(preise).toEqual(['58,00 € / Std', '8,95 € / Stk']);
  });

  it('filtert nach Typ und Suche', async () => {
    await seite.setzeTypFilter('Arbeit');
    await fixture.whenStable();
    expect(namen()).toEqual(['Monteurstunde']);

    await seite.setzeTypFilter('Alle');
    await seite.setzeSuche('latte');
    await fixture.whenStable();
    expect(namen()).toEqual(['Zaunlatte Lärche']);

    await seite.setzeTypFilter('Anfahrt');
    await fixture.whenStable();
    expect(el.querySelector('.split-liste .leer')?.textContent).toContain('Keine Artikel gefunden');
  });

  it('zeigt den Preis beim Bearbeiten als Euro-Betrag', () => {
    seite.waehle(seite.artikelListe()[1]);
    expect(seite.form.getRawValue().preis).toBe('8,95');
  });

  it('speichert die Euro-Eingabe als Cent', async () => {
    seite.neu();
    seite.form.patchValue({ bezeichnung: 'Pfostenschuh', preis: '12,5' });
    expect(await seite.speichern()).toBe(true);
    const [artikel] = await repo.alle({ suche: 'pfosten' });
    expect(artikel.nettopreisCent).toBe(1250);
    expect(artikel.typ).toBe('Material');
    expect(artikel.einheit).toBe('Stk');
  });

  it('prüft Bezeichnung und Preis', async () => {
    seite.neu();
    expect(await seite.speichern()).toBe(false);
    expect(seite.fehler()).toEqual(['Bezeichnung: bitte ausfüllen', 'Nettopreis: bitte ausfüllen']);

    seite.form.patchValue({ bezeichnung: 'Pfostenschuh', preis: '12,345' });
    expect(await seite.speichern()).toBe(false);
    expect(seite.fehler()).toEqual(['Nettopreis: ungültiger Betrag']);

    seite.form.patchValue({ preis: '-5' });
    expect(await seite.speichern()).toBe(false);
    expect(await repo.alle()).toHaveLength(2);
  });

  it('schlägt beim Anlegen die übliche Einheit des Typs vor', () => {
    seite.neu();
    seite.form.controls.typ.setValue('Arbeit');
    expect(seite.form.getRawValue().einheit).toBe('Std');
    seite.form.controls.typ.setValue('Anfahrt');
    expect(seite.form.getRawValue().einheit).toBe('pauschal');
  });

  it('legt neue Artikel im gerade gefilterten Typ an', async () => {
    await seite.setzeTypFilter('Anfahrt');
    seite.neu();
    expect(seite.form.getRawValue().typ).toBe('Anfahrt');
    expect(seite.form.getRawValue().einheit).toBe('pauschal');
  });

  it('setzt und entfernt den Standard-Stundensatz', async () => {
    const stunde = seite.artikelListe()[0];
    seite.waehle(stunde);
    await fixture.whenStable();
    expect(el.querySelector('ion-checkbox')).not.toBeNull();

    seite.form.patchValue({ istStundensatz: true });
    await seite.speichern();
    await fixture.whenStable();
    expect(await stundensatz()).toBe(stunde.id);
    expect(el.querySelector('.split-liste ion-item p')?.textContent).toContain(
      'Standard-Stundensatz',
    );

    seite.form.patchValue({ istStundensatz: false });
    await seite.speichern();
    expect(await stundensatz()).toBeNull();
  });

  it('bietet den Standard-Stundensatz nur bei Arbeit an', async () => {
    seite.waehle(seite.artikelListe()[1]);
    await fixture.whenStable();
    expect(el.querySelector('ion-checkbox')).toBeNull();
  });

  it('löscht nach Bestätigung', async () => {
    seite.waehle(seite.artikelListe()[1]);
    await seite.loeschen();
    await fixture.whenStable();
    expect(namen()).toEqual(['Monteurstunde']);
    expect(TestBed.inject(TestDialoge).fragen).toEqual(['Artikel löschen?']);
  });
});
