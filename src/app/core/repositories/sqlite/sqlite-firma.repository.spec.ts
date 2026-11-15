import { testKontext } from '../../../testing/test-datenbank';
import {
  Firmendaten,
  LEERE_FIRMENDATEN,
  STANDARD_EINSTELLUNGEN,
  fehlendeFirmenangaben,
} from '../../domain/firma';
import { RepoKontext } from './kontext';
import { vergibNummer } from './nummernvergabe';
import {
  SqliteEinstellungenRepository,
  SqliteFirmendatenRepository,
} from './sqlite-firma.repository';

const FIRMA: Firmendaten = {
  name: 'Haustechnik Clausen',
  strasse: 'Werftstraße 12',
  plz: '24103',
  ort: 'Kiel',
  land: 'Deutschland',
  telefon: '0431 123456',
  email: 'info@haustechnik-clausen.de',
  steuernummer: '20/123/45678',
  ustId: 'DE123456789',
  bankInhaber: 'Jan Clausen',
  bankIban: 'DE89370400440532013000',
  bankBic: 'COBADEFFXXX',
  bankName: 'Commerzbank',
  logo: 'data:image/png;base64,AAAA',
};

describe('Firmendaten und Einstellungen (SQLite)', () => {
  let kontext: RepoKontext;
  let firma: SqliteFirmendatenRepository;
  let einstellungen: SqliteEinstellungenRepository;

  beforeEach(async () => {
    kontext = await testKontext();
    firma = new SqliteFirmendatenRepository(kontext);
    einstellungen = new SqliteEinstellungenRepository(kontext);
  });

  afterEach(() => kontext.db.close());

  it('liefert bei leerer Datenbank leere Firmendaten und Standard-Einstellungen', async () => {
    expect(await firma.laden()).toEqual(LEERE_FIRMENDATEN);
    expect(await einstellungen.laden()).toEqual(STANDARD_EINSTELLUNGEN);
    expect((await einstellungen.laden()).zahlungszielTage).toBe(14);
  });

  it('speichert und lädt Firmendaten', async () => {
    await firma.speichern(FIRMA);
    expect(await firma.laden()).toEqual(FIRMA);
  });

  it('überschreibt beim erneuten Speichern, statt einen zweiten Satz anzulegen', async () => {
    await firma.speichern(FIRMA);
    await firma.speichern({ ...FIRMA, ort: 'Lübeck', logo: null });
    expect((await firma.laden()).ort).toBe('Lübeck');
    expect((await firma.laden()).logo).toBeNull();
    expect(await kontext.db.query('SELECT id FROM firmendaten')).toHaveLength(1);
  });

  it('normalisiert IBAN, BIC und USt-IdNr. und entfernt Leerraum', async () => {
    await firma.speichern({
      ...FIRMA,
      name: '  Haustechnik Clausen ',
      bankIban: 'de89 3704 0044 0532 0130 00',
      bankBic: 'cobadeffxxx',
      ustId: 'de 123456789',
    });
    const geladen = await firma.laden();
    expect(geladen.name).toBe('Haustechnik Clausen');
    expect(geladen.bankIban).toBe('DE89370400440532013000');
    expect(geladen.bankBic).toBe('COBADEFFXXX');
    expect(geladen.ustId).toBe('DE123456789');
  });

  it('speichert und lädt Einstellungen', async () => {
    const neu = { ...STANDARD_EINSTELLUNGEN, zahlungszielTage: 30, textSchluss: 'Danke!' };
    await einstellungen.speichern(neu);
    expect(await einstellungen.laden()).toEqual(neu);
  });

  it('lehnt ungültige Einstellungen ab', async () => {
    await expect(
      einstellungen.speichern({ ...STANDARD_EINSTELLUNGEN, zahlungszielTage: -1 }),
    ).rejects.toThrow();
    await expect(
      einstellungen.speichern({ ...STANDARD_EINSTELLUNGEN, zahlungszielTage: 1.5 }),
    ).rejects.toThrow();
    await expect(
      einstellungen.speichern({ ...STANDARD_EINSTELLUNGEN, praefixRechnung: 'RE-' }),
    ).rejects.toThrow();
    await expect(
      einstellungen.speichern({ ...STANDARD_EINSTELLUNGEN, praefixAuftrag: '' }),
    ).rejects.toThrow();
  });

  it('verwendet ein geändertes Präfix bei der Nummernvergabe', async () => {
    await einstellungen.speichern({ ...STANDARD_EINSTELLUNGEN, praefixRechnung: 'R' });
    expect(await kontext.db.transaction((tx) => vergibNummer(tx, 'Rechnung', 2026))).toBe(
      'R-2026-0001',
    );
  });
});

describe('fehlendeFirmenangaben', () => {
  it('meldet nichts bei vollständigen Angaben', () => {
    expect(fehlendeFirmenangaben(FIRMA)).toEqual([]);
    expect(fehlendeFirmenangaben({ ...FIRMA, ustId: '' })).toEqual([]);
  });

  it('nennt fehlende Pflichtangaben', () => {
    expect(fehlendeFirmenangaben(LEERE_FIRMENDATEN)).toEqual([
      'Firmenname',
      'Anschrift',
      'Steuernummer oder USt-IdNr.',
    ]);
    expect(fehlendeFirmenangaben({ ...FIRMA, steuernummer: '', ustId: '' })).toEqual([
      'Steuernummer oder USt-IdNr.',
    ]);
  });
});
