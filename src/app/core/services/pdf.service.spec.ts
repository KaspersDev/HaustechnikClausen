import { TestBed } from '@angular/core/testing';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { RECHNUNG_REPOSITORY, RechnungRepository } from '../repositories/rechnung.repository';
import {
  Grunddaten,
  entwurfsdaten,
  legeAuftragAn,
  legeGrunddatenAn,
  pos,
} from '../../testing/fixtures';
import { testKontext } from '../../testing/test-datenbank';
import { provideTestUmgebung } from '../../testing/test-providers';
import { DATEIAUSGABE, PdfDatei, PdfService } from './pdf.service';

async function lies(datei: PdfDatei): Promise<{ seiten: number; text: string }> {
  const bytes = Uint8Array.from(atob(datei.base64), (z) => z.charCodeAt(0));
  const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const teile: string[] = [];
  for (let nr = 1; nr <= pdf.numPages; nr++) {
    const inhalt = await (await pdf.getPage(nr)).getTextContent();
    teile.push(inhalt.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return { seiten: pdf.numPages, text: teile.join('\n').replace(/\s+/g, ' ') };
}

describe('PdfService', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let service: PdfService;
  let repo: RechnungRepository;
  let daten: Grunddaten;
  let auftragId: string;
  let ausgegeben: PdfDatei[];

  beforeEach(async () => {
    kontext = await testKontext();
    ausgegeben = [];
    TestBed.configureTestingModule({
      providers: [
        provideTestUmgebung(kontext),
        {
          provide: DATEIAUSGABE,
          useValue: { ausgeben: async (d: PdfDatei) => void ausgegeben.push(d) },
        },
      ],
    });
    service = TestBed.inject(PdfService);
    repo = TestBed.inject(RECHNUNG_REPOSITORY);
    daten = await legeGrunddatenAn(kontext);
    auftragId = (await legeAuftragAn(kontext, daten.kunde.id)).id;
  });

  afterEach(() => kontext.db.close());

  it('erzeugt ein gültiges PDF mit allen Angaben der Rechnung', async () => {
    const r = await repo.festschreiben(
      (await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, auftragId))).id,
    );
    const datei = await service.erzeuge(r.id);
    expect(datei.dateiname).toBe('Rechnung-RE-2026-0001.pdf');
    expect(atob(datei.base64).startsWith('%PDF-')).toBe(true);

    const { seiten, text } = await lies(datei);
    expect(seiten).toBe(1);
    for (const erwartet of [
      'Haustechnik Clausen',
      'Erika Müller',
      'Hafenweg 3',
      'RE-2026-0001',
      '10.03.2026',
      'Arbeitsleistungen',
      'Zwischensumme Material',
      'Zwischensumme Anfahrt',
      'Zaunlatte Lärche 180 cm',
      '314,40 €',
      '59,74 €',
      '374,14 €',
      'zwei Jahre',
      '§ 35a EStG',
      'IBAN DE89 3704 0044 0532 0130 00',
      'Steuernummer 20/123/45678',
      'Seite 1 von 1',
    ]) {
      expect(text).toContain(erwartet);
    }
    expect(text).not.toContain('ENTWURF');
  }, 30_000);

  it('kennzeichnet Entwürfe mit einem Wasserzeichen', async () => {
    const e = await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, auftragId));
    const datei = await service.erzeuge(e.id);
    expect(datei.dateiname).toBe('Rechnungsentwurf-Entwurf.pdf');
    const { text } = await lies(datei);
    expect(text).toContain('ENTWURF');
    expect(text).toContain('Rechnungsentwurf');
  }, 30_000);

  it('lässt bei Gewerbekunden die Hinweise für Privatkunden weg', async () => {
    const r = await repo.festschreiben(
      (await repo.entwurfAnlegen(entwurfsdaten(daten.gewerbekunde.id, null))).id,
    );
    const { text } = await lies(await service.erzeuge(r.id));
    expect(text).toContain('Bäckerei Hansen GmbH');
    expect(text).toContain('DE987654321');
    expect(text).not.toContain('zwei Jahre');
    expect(text).not.toContain('§ 35a');
  }, 30_000);

  it('verweist in der Stornorechnung auf das Original', async () => {
    const r = await repo.festschreiben(
      (await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, auftragId))).id,
    );
    const storno = await repo.stornieren(r.id);
    const { text } = await lies(await service.erzeuge(storno.id));
    expect(text).toContain('Stornorechnung');
    expect(text).toContain('hebt die Rechnung RE-2026-0001 vom 10.03.2026 vollständig auf');
    expect(text).toContain('-374,14 €');
  }, 30_000);

  it('bricht bei vielen Positionen auf weitere Seiten um und wiederholt den Tabellenkopf', async () => {
    const positionen = Array.from({ length: 70 }, (_, i) =>
      pos('Material', `Bauteil ${i + 1}`, 1, 100),
    );
    const e = await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, null, { positionen }));
    const r = await repo.festschreiben(e.id);
    const { seiten, text } = await lies(await service.erzeuge(r.id));
    expect(seiten).toBeGreaterThan(1);
    expect(text).toContain('Bauteil 1 ');
    expect(text).toContain('Bauteil 70');
    expect(text).toContain(`Seite ${seiten} von ${seiten}`);
    // Der Tabellenkopf steht auf jeder Seite, auf der die Tabelle weiterläuft.
    expect(text.match(/Einzelpreis/g)?.length).toBeGreaterThanOrEqual(seiten - 1);
    expect(text.match(/Einzelpreis/g)?.length).toBeGreaterThan(1);
  }, 30_000);

  it('übergibt das PDF an die Dateiausgabe', async () => {
    const e = await repo.entwurfAnlegen(entwurfsdaten(daten.kunde.id, auftragId));
    await service.oeffne(e.id);
    expect(ausgegeben).toHaveLength(1);
    expect(ausgegeben[0].dateiname).toBe('Rechnungsentwurf-Entwurf.pdf');
  }, 30_000);

  it('meldet eine unbekannte Rechnung', async () => {
    await expect(service.erzeuge('gibt-es-nicht')).rejects.toThrow(/nicht gefunden/);
  });
});
