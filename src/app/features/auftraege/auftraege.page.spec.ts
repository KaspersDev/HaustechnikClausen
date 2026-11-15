import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuftragMitKunde, AuftragStatus } from '../../core/domain/auftrag';
import { LEERER_KUNDE } from '../../core/domain/kunde';
import { AUFTRAG_REPOSITORY, AuftragRepository } from '../../core/repositories/auftrag.repository';
import { KUNDE_REPOSITORY } from '../../core/repositories/kunde.repository';
import { RECHNUNG_REPOSITORY } from '../../core/repositories/rechnung.repository';
import { testKontext } from '../../testing/test-datenbank';
import { TestDialoge, provideTestUmgebung } from '../../testing/test-providers';
import { AuftraegePage } from './auftraege.page';

describe('AuftraegePage (Kanban-Board)', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let fixture: ComponentFixture<AuftraegePage>;
  let seite: AuftraegePage;
  let repo: AuftragRepository;
  let dialoge: TestDialoge;
  let el: HTMLElement;
  let ids: Record<string, string>;

  const spalte = (status: AuftragStatus): string[] =>
    Array.from(el.querySelectorAll(`.spalte[data-status="${status}"] .auftragskarte h3`)).map(
      (h) => h.textContent?.trim() ?? '',
    );
  const karte = (titel: string): AuftragMitKunde => {
    const treffer = Object.values(seite.spalten())
      .flat()
      .find((a) => a.titel === titel);
    if (!treffer) throw new Error(`Karte ${titel} fehlt`);
    return treffer;
  };
  const ziehe = async (titel: string, ziel: AuftragStatus, index: number): Promise<void> => {
    await seite.abgelegt({
      item: { data: karte(titel) },
      container: { data: ziel },
      currentIndex: index,
    });
    await fixture.whenStable();
  };
  const gespeichert = async (status: AuftragStatus): Promise<string[]> =>
    (await repo.alle()).filter((a) => a.status === status).map((a) => a.titel);

  beforeEach(async () => {
    kontext = await testKontext();
    TestBed.configureTestingModule({ providers: [provideTestUmgebung(kontext)] });
    repo = TestBed.inject(AUFTRAG_REPOSITORY);
    dialoge = TestBed.inject(TestDialoge);
    const kunde = await TestBed.inject(KUNDE_REPOSITORY).anlegen({
      ...LEERER_KUNDE,
      name: 'Erika Müller',
    });
    ids = {};
    for (const titel of ['Zaun', 'Trockenbau', 'Carport', 'Dachrinne', 'Gartentor']) {
      ids[titel] = (
        await repo.anlegen({
          kundeId: kunde.id,
          titel,
          beschreibung: '',
          einsatzort: { strasse: 'Hafenweg 3', plz: '24103', ort: 'Kiel', land: 'Deutschland' },
          geplantAm: titel === 'Zaun' ? '2026-03-20' : null,
        })
      ).id;
    }
    await repo.verschiebe(ids['Carport'], 'InArbeit');
    await repo.verschiebe(ids['Dachrinne'], 'Erledigt');
    await repo.verschiebe(ids['Gartentor'], 'Erledigt');
    await kontext.db.run(`UPDATE auftrag SET status = 'Abgerechnet' WHERE id = ?`, [
      ids['Gartentor'],
    ]);

    fixture = TestBed.createComponent(AuftraegePage);
    seite = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    await seite.geladen;
    await fixture.whenStable();
  });

  afterEach(() => kontext.db.close());

  it('zeigt vier Spalten mit den Aufträgen im jeweiligen Status', () => {
    expect(Array.from(el.querySelectorAll('.spalte h2')).map((h) => h.textContent?.trim())).toEqual(
      ['Offen', 'In Arbeit', 'Erledigt', 'Abgerechnet'],
    );
    expect(spalte('Offen')).toEqual(['Zaun', 'Trockenbau']);
    expect(spalte('InArbeit')).toEqual(['Carport']);
    expect(spalte('Erledigt')).toEqual(['Dachrinne']);
    expect(spalte('Abgerechnet')).toEqual(['Gartentor']);
    expect(Array.from(el.querySelectorAll('.anzahl')).map((a) => a.textContent?.trim())).toEqual([
      '2',
      '1',
      '1',
      '1',
    ]);
  });

  it('zeigt auf der Karte Nummer, Kunde, Ort und Termin', () => {
    const text = el.querySelector('.auftragskarte[data-nummer="AU-2026-0001"]')?.textContent ?? '';
    expect(text).toContain('AU-2026-0001');
    expect(text).toContain('Zaun');
    expect(text).toContain('Erika Müller');
    expect(text).toContain('Hafenweg 3, 24103 Kiel');
    expect(text).toContain('Geplant 20.03.2026');
    expect(el.querySelector('.spalte[data-status="Erledigt"] .termin')?.textContent).toContain(
      'Erledigt 10.03.2026',
    );
  });

  it('übernimmt beim Ablegen in einer anderen Spalte Status und Position dauerhaft', async () => {
    await ziehe('Zaun', 'InArbeit', 0);
    expect(spalte('Offen')).toEqual(['Trockenbau']);
    expect(spalte('InArbeit')).toEqual(['Zaun', 'Carport']);
    expect(await gespeichert('InArbeit')).toEqual(['Zaun', 'Carport']);
    expect((await repo.finde(ids['Zaun']))?.status).toBe('InArbeit');
  });

  it('setzt beim Ziehen nach „Erledigt" das Erledigt-Datum', async () => {
    kontext.uhr.zeit = '2026-03-15T12:00:00.000Z';
    await ziehe('Carport', 'Erledigt', 1);
    expect(await gespeichert('Erledigt')).toEqual(['Dachrinne', 'Carport']);
    expect((await repo.finde(ids['Carport']))?.erledigtAm).toBe('2026-03-15T12:00:00.000Z');
  });

  it('sortiert innerhalb einer Spalte um', async () => {
    await ziehe('Trockenbau', 'Offen', 0);
    expect(spalte('Offen')).toEqual(['Trockenbau', 'Zaun']);
    expect(await gespeichert('Offen')).toEqual(['Trockenbau', 'Zaun']);
  });

  it('weist das Ablegen in „Abgerechnet" ab und lässt die Karte, wo sie war', async () => {
    dialoge.antwort = false;
    await ziehe('Dachrinne', 'Abgerechnet', 0);
    expect(spalte('Erledigt')).toEqual(['Dachrinne']);
    expect(spalte('Abgerechnet')).toEqual(['Gartentor']);
    expect((await repo.finde(ids['Dachrinne']))?.status).toBe('Erledigt');
    expect(dialoge.fragen).toEqual(['Rechnung erzeugen?']);

    await ziehe('Zaun', 'Abgerechnet', 0);
    expect((await repo.finde(ids['Zaun']))?.status).toBe('Offen');
    expect(dialoge.fehler[0]).toContain('Nur erledigte Aufträge');
  });

  it('bietet beim Ziehen eines erledigten Auftrags nach „Abgerechnet" die Rechnung an', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await ziehe('Dachrinne', 'Abgerechnet', 0);
    const [entwurf] = await TestBed.inject(RECHNUNG_REPOSITORY).alle();
    expect(entwurf.status).toBe('Entwurf');
    expect(entwurf.auftragId).toBe(ids['Dachrinne']);
    expect(navigate).toHaveBeenCalledWith(['/rechnungen', entwurf.id]);
    expect((await repo.finde(ids['Dachrinne']))?.status).toBe('Erledigt');
  });

  it('lässt abgerechnete Karten nicht ziehen und nicht verschieben', async () => {
    const abgerechnet = el.querySelector('.spalte[data-status="Abgerechnet"] .auftragskarte');
    expect(abgerechnet?.classList.contains('cdk-drag-disabled')).toBe(true);
    expect(
      el
        .querySelector('.spalte[data-status="Offen"] .auftragskarte')
        ?.classList.contains('cdk-drag-disabled'),
    ).toBe(false);

    await ziehe('Gartentor', 'Offen', 0);
    expect(spalte('Abgerechnet')).toEqual(['Gartentor']);
    expect((await repo.finde(ids['Gartentor']))?.status).toBe('Abgerechnet');
  });

  it('stellt nach einem Fehler beim Speichern den gespeicherten Stand wieder her', async () => {
    const zaun = karte('Zaun');
    await kontext.db.run(`UPDATE auftrag SET status = 'Abgerechnet' WHERE id = ?`, [zaun.id]);
    await ziehe('Zaun', 'InArbeit', 0);
    expect(dialoge.fehler[0]).toContain('nicht mehr verschoben');
    expect(spalte('InArbeit')).toEqual(['Carport']);
    expect(spalte('Abgerechnet')).toEqual(['Zaun', 'Gartentor']);
  });

  it('filtert die Karten über die Suche und sperrt dabei das Umsortieren', async () => {
    await seite.setzeSuche('trocken');
    await fixture.whenStable();
    expect(spalte('Offen')).toEqual(['Trockenbau']);
    expect(spalte('InArbeit')).toEqual([]);
    expect(el.querySelector('.auftragskarte')?.classList.contains('cdk-drag-disabled')).toBe(true);
  });

  it('öffnet beim Antippen den Auftrag', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (el.querySelector('.auftragskarte[data-nummer="AU-2026-0001"]') as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith(['/auftraege', ids['Zaun']]);
  });
});
