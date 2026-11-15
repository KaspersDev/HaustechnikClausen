import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { NAVIGATION } from './navigation';
import { testKontext } from './testing/test-datenbank';
import { provideTestUmgebung } from './testing/test-providers';

describe('App-Shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideTestUmgebung(await testKontext(), routes)],
    }).compileComponents();
  });

  it('rendert die Shell mit Menü und Inhaltsbereich', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('ion-split-pane')).not.toBeNull();
    expect(el.querySelector('ion-menu')).not.toBeNull();
    expect(el.querySelector('ion-router-outlet#hauptinhalt')).not.toBeNull();
  });

  it('zeigt alle fünf Bereiche in der Navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const titel = Array.from(el.querySelectorAll('.nav-eintrag ion-label')).map((l) =>
      l.textContent?.trim(),
    );
    expect(titel).toEqual([
      'Aufträge',
      'Kunden',
      'Artikel & Leistungen',
      'Rechnungen',
      'Einstellungen',
    ]);
  });

  it('hat für jeden Navigationseintrag eine Route', () => {
    const pfade = routes.map((r) => `/${r.path}`);
    for (const eintrag of NAVIGATION) {
      expect(pfade).toContain(eintrag.pfad);
    }
  });

  it('leitet die Startseite auf das Auftrags-Board um', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/auftraege');
  });

  it.each(NAVIGATION.map((e) => [e.pfad, e.titel] as const))(
    'routet %s auf die Seite „%s"',
    async (pfad, titel) => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(pfad);
      expect(TestBed.inject(Router).url).toBe(pfad);
      const seite = harness.routeNativeElement as HTMLElement;
      expect(seite.querySelector('ion-title')?.textContent?.trim()).toBe(titel);
    },
  );
});
