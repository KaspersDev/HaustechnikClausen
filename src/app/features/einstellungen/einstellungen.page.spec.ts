import { ComponentFixture, TestBed } from '@angular/core/testing';
import initSqlJs from 'sql.js';
import { STANDARD_EINSTELLUNGEN } from '../../core/domain/firma';
import {
  EINSTELLUNGEN_REPOSITORY,
  FIRMENDATEN_REPOSITORY,
} from '../../core/repositories/firma.repository';
import { NUMMERNKREIS_REPOSITORY } from '../../core/repositories/nummernkreis.repository';
import { vergibNummer } from '../../core/repositories/sqlite/nummernvergabe';
import { SQLJS_LADER } from '../../core/services/datensicherung.service';
import { DATEIAUSGABE } from '../../core/services/pdf.service';
import { testKontext } from '../../testing/test-datenbank';
import { TestDialoge, provideTestUmgebung } from '../../testing/test-providers';
import { EinstellungenPage } from './einstellungen.page';

const GUELTIG = {
  name: 'Haustechnik Clausen',
  strasse: 'Werftstraße 12',
  plz: '24103',
  ort: 'Kiel',
  steuernummer: '20/123/45678',
  bankIban: 'DE89 3704 0044 0532 0130 00',
};

describe('EinstellungenPage', () => {
  let kontext: Awaited<ReturnType<typeof testKontext>>;
  let fixture: ComponentFixture<EinstellungenPage>;
  let seite: EinstellungenPage;

  async function erzeugen(): Promise<void> {
    fixture = TestBed.createComponent(EinstellungenPage);
    seite = fixture.componentInstance;
    await seite.geladen;
    await fixture.whenStable();
  }

  const fehlertexte = (): string[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.fehlerliste li')).map(
      (li) => li.textContent?.trim() ?? '',
    );

  beforeEach(async () => {
    kontext = await testKontext();
    TestBed.configureTestingModule({ providers: [provideTestUmgebung(kontext)] });
  });

  afterEach(() => kontext.db.close());

  it('zeigt bei leerer Datenbank die Standardwerte', async () => {
    await erzeugen();
    const werte = seite.form.getRawValue();
    expect(werte.name).toBe('');
    expect(werte.land).toBe('Deutschland');
    expect(werte.zahlungszielTage).toBe(14);
    expect(werte.praefixRechnung).toBe('RE');
    expect(werte.naechsteRechnung).toBe(1);
    expect(werte.textAufbewahrung).toBe(STANDARD_EINSTELLUNGEN.textAufbewahrung);
  });

  it('zeigt Fehler und speichert nichts, solange Pflichtfelder fehlen', async () => {
    await erzeugen();
    expect(await seite.speichern()).toBe(false);
    await fixture.whenStable();
    expect(fehlertexte()).toEqual([
      'Firmenname: bitte ausfüllen',
      'Straße: bitte ausfüllen',
      'PLZ: bitte ausfüllen',
      'Ort: bitte ausfüllen',
    ]);
    expect((await TestBed.inject(FIRMENDATEN_REPOSITORY).laden()).name).toBe('');
  });

  it('prüft IBAN, PLZ, E-Mail und Zahlungsziel', async () => {
    await erzeugen();
    seite.form.patchValue({
      ...GUELTIG,
      plz: '2410',
      email: 'info@',
      bankIban: 'DE89370400440532013001',
      zahlungszielTage: -3,
    });
    expect(await seite.speichern()).toBe(false);
    expect(seite.fehler()).toEqual([
      'PLZ: ungültige Postleitzahl',
      'E-Mail: ungültige E-Mail-Adresse',
      'IBAN: ungültige IBAN',
      'Zahlungsziel: ungültige Zahl',
    ]);
  });

  it('speichert gültige Firmendaten und Einstellungen', async () => {
    await erzeugen();
    seite.form.patchValue({ ...GUELTIG, zahlungszielTage: 30, praefixRechnung: 'R' });
    expect(await seite.speichern()).toBe(true);
    expect(seite.fehler()).toEqual([]);

    const firma = await TestBed.inject(FIRMENDATEN_REPOSITORY).laden();
    expect(firma.name).toBe('Haustechnik Clausen');
    expect(firma.bankIban).toBe('DE89370400440532013000');
    const einstellungen = await TestBed.inject(EINSTELLUNGEN_REPOSITORY).laden();
    expect(einstellungen.zahlungszielTage).toBe(30);
    expect(einstellungen.praefixRechnung).toBe('R');
  });

  it('lädt gespeicherte Werte beim nächsten Öffnen', async () => {
    await erzeugen();
    seite.form.patchValue({ ...GUELTIG, telefon: '0431 123456' });
    await seite.speichern();
    await erzeugen();
    expect(seite.form.getRawValue().telefon).toBe('0431 123456');
    expect(seite.form.getRawValue().ort).toBe('Kiel');
  });

  it('übernimmt einen geänderten Startwert für Rechnungsnummern', async () => {
    await erzeugen();
    seite.form.patchValue(GUELTIG);
    seite.form.controls.naechsteRechnung.setValue(87);
    seite.form.controls.naechsteRechnung.markAsDirty();
    expect(await seite.speichern()).toBe(true);
    const stand = await TestBed.inject(NUMMERNKREIS_REPOSITORY).stand('Rechnung', 2026);
    expect(stand.naechsteNummer).toBe(87);
  });

  it('sperrt die nächste Nummer, sobald im Jahr eine vergeben wurde', async () => {
    await kontext.db.transaction((tx) => vergibNummer(tx, 'Rechnung', 2026));
    await erzeugen();
    expect(seite.form.controls.naechsteRechnung.disabled).toBe(true);
    expect(seite.form.getRawValue().naechsteRechnung).toBe(2);
    expect(seite.form.controls.naechsterAuftrag.enabled).toBe(true);
  });

  it('übernimmt ein Logo als Data-URL und speichert es', async () => {
    await erzeugen();
    seite.form.patchValue(GUELTIG);
    await seite.uebernimmLogo(new Blob(['abc'], { type: 'image/png' }));
    expect(seite.logo()).toMatch(/^data:image\/png;base64,/);
    await seite.speichern();
    expect((await TestBed.inject(FIRMENDATEN_REPOSITORY).laden()).logo).toBe(seite.logo());
  });

  it('lehnt falsche Dateitypen und zu große Logos ab', async () => {
    await erzeugen();
    await seite.uebernimmLogo(new Blob(['abc'], { type: 'application/pdf' }));
    expect(seite.logo()).toBeNull();
    expect(seite.fehler()[0]).toContain('PNG- oder JPEG');
    await seite.uebernimmLogo(new Blob([new Uint8Array(1024 * 1024 + 1)], { type: 'image/png' }));
    expect(seite.logo()).toBeNull();
    expect(seite.fehler()[0]).toContain('größer als 1 MB');
  });

  describe('Datensicherung', () => {
    let ausgegeben: { dateiname: string; base64: string }[];

    const sicherung = (): Blob =>
      new Blob([Uint8Array.from(atob(ausgegeben[0].base64), (z) => z.charCodeAt(0))]);

    beforeEach(async () => {
      ausgegeben = [];
      TestBed.overrideProvider(DATEIAUSGABE, {
        useValue: {
          ausgeben: async (d: { dateiname: string; base64: string }) => void ausgegeben.push(d),
        },
      });
      TestBed.overrideProvider(SQLJS_LADER, { useValue: () => initSqlJs() });
      await erzeugen();
      seite.nachWiederherstellung = () => undefined;
      seite.form.patchValue(GUELTIG);
      await seite.speichern();
    });

    it('bietet Export und Wiederherstellung als Schaltflächen an', async () => {
      const el = fixture.nativeElement as HTMLElement;
      (el.querySelector('ion-button.exportieren') as HTMLElement).click();
      await vi.waitFor(() => expect(ausgegeben).toHaveLength(1));
      expect(el.querySelector('ion-button.wiederherstellen')).not.toBeNull();
      expect(el.querySelector('input[type="file"][accept*=".sqlite"]')).not.toBeNull();
    });

    it('exportiert den Datenbestand als Datei mit Datum im Namen', async () => {
      await seite.exportieren();
      expect(ausgegeben[0].dateiname).toBe('haustechnik-sicherung-2026-03-10.sqlite');
      expect(atob(ausgegeben[0].base64).startsWith('SQLite format 3')).toBe(true);
      expect(TestBed.inject(TestDialoge).erfolge.at(-1)).toContain('Sicherung erstellt');
    });

    it('stellt nach Bestätigung den exportierten Stand wieder her', async () => {
      await seite.exportieren();
      seite.form.patchValue({ name: 'Geändert GmbH' });
      await seite.speichern();

      expect(await seite.wiederherstellen(sicherung())).toBe(true);
      expect((await TestBed.inject(FIRMENDATEN_REPOSITORY).laden()).name).toBe(
        'Haustechnik Clausen',
      );
      expect(seite.form.getRawValue().name).toBe('Haustechnik Clausen');
      expect(TestBed.inject(TestDialoge).fragen).toEqual(['Daten wiederherstellen?']);
    });

    it('stellt ohne Bestätigung nichts wieder her', async () => {
      await seite.exportieren();
      seite.form.patchValue({ name: 'Geändert GmbH' });
      await seite.speichern();
      TestBed.inject(TestDialoge).antwort = false;
      expect(await seite.wiederherstellen(sicherung())).toBe(false);
      expect((await TestBed.inject(FIRMENDATEN_REPOSITORY).laden()).name).toBe('Geändert GmbH');
    });

    it('meldet eine ungültige Datei und behält die Daten', async () => {
      expect(await seite.wiederherstellen(new Blob(['kein sqlite']))).toBe(false);
      expect(seite.fehler()[0]).toContain('keine Datensicherung dieser App');
      expect((await TestBed.inject(FIRMENDATEN_REPOSITORY).laden()).name).toBe(
        'Haustechnik Clausen',
      );
    });
  });
});
