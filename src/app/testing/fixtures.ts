import { Artikel } from '../core/domain/artikel';
import { Auftrag } from '../core/domain/auftrag';
import { Firmendaten, STANDARD_EINSTELLUNGEN } from '../core/domain/firma';
import { Kunde, KundeDaten, LEERER_KUNDE } from '../core/domain/kunde';
import { RechnungEntwurfDaten, RechnungspositionDaten } from '../core/domain/rechnung';
import { RepoKontext } from '../core/repositories/sqlite/kontext';
import { SqliteArtikelRepository } from '../core/repositories/sqlite/sqlite-artikel.repository';
import { SqliteAuftragRepository } from '../core/repositories/sqlite/sqlite-auftrag.repository';
import {
  SqliteMaterialeintragRepository,
  SqliteZeiteintragRepository,
} from '../core/repositories/sqlite/sqlite-erfassung.repository';
import {
  SqliteEinstellungenRepository,
  SqliteFirmendatenRepository,
} from '../core/repositories/sqlite/sqlite-firma.repository';
import { SqliteKundeRepository } from '../core/repositories/sqlite/sqlite-kunde.repository';

export const TEST_FIRMA: Firmendaten = {
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
  logo: null,
};

export const TEST_PRIVATKUNDE: KundeDaten = {
  ...LEERER_KUNDE,
  name: 'Erika Müller',
  strasse: 'Hafenweg 3',
  plz: '24103',
  ort: 'Kiel',
};

export const TEST_GEWERBEKUNDE: KundeDaten = {
  ...LEERER_KUNDE,
  typ: 'Gewerbe',
  firma: 'Bäckerei Hansen GmbH',
  name: 'Ole Hansen',
  strasse: 'Am Markt 1',
  plz: '23552',
  ort: 'Lübeck',
  ustId: 'DE987654321',
};

export const pos = (
  typ: RechnungspositionDaten['typ'],
  beschreibung: string,
  menge: number,
  einzelpreisCent: number,
  mehr: Partial<RechnungspositionDaten> = {},
): RechnungspositionDaten => ({
  artikelId: null,
  beschreibung,
  menge,
  einheit: typ === 'Arbeit' ? 'Std' : typ === 'Material' ? 'Stk' : 'pauschal',
  einzelpreisCent,
  mwstSatz: 19,
  typ,
  ...mehr,
});

export interface Grunddaten {
  readonly kunde: Kunde;
  readonly gewerbekunde: Kunde;
  readonly stunde: Artikel;
  readonly latte: Artikel;
  readonly anfahrt: Artikel;
}

/** Firmendaten, Einstellungen mit Stundensatz, zwei Kunden und drei Artikel. */
export async function legeGrunddatenAn(kontext: RepoKontext): Promise<Grunddaten> {
  await new SqliteFirmendatenRepository(kontext).speichern(TEST_FIRMA);
  const kunden = new SqliteKundeRepository(kontext);
  const artikel = new SqliteArtikelRepository(kontext);
  const kunde = await kunden.anlegen(TEST_PRIVATKUNDE);
  const gewerbekunde = await kunden.anlegen(TEST_GEWERBEKUNDE);
  const stunde = await artikel.anlegen({
    bezeichnung: 'Monteurstunde',
    einheit: 'Std',
    nettopreisCent: 5800,
    mwstSatz: 19,
    typ: 'Arbeit',
  });
  const latte = await artikel.anlegen({
    bezeichnung: 'Zaunlatte Lärche 180 cm',
    einheit: 'Stk',
    nettopreisCent: 895,
    mwstSatz: 19,
    typ: 'Material',
  });
  const anfahrt = await artikel.anlegen({
    bezeichnung: 'Anfahrt Stadtgebiet',
    einheit: 'pauschal',
    nettopreisCent: 2500,
    mwstSatz: 19,
    typ: 'Anfahrt',
  });
  await new SqliteEinstellungenRepository(kontext).speichern({
    ...STANDARD_EINSTELLUNGEN,
    standardStundensatzArtikelId: stunde.id,
  });
  return { kunde, gewerbekunde, stunde, latte, anfahrt };
}

/** Auftrag für den Privatkunden; mit `erledigt` steht er in „Erledigt". */
export async function legeAuftragAn(
  kontext: RepoKontext,
  kundeId: string,
  titel = 'Zaun reparieren',
  erledigt = true,
): Promise<Auftrag> {
  const repo = new SqliteAuftragRepository(kontext);
  const auftrag = await repo.anlegen({
    kundeId,
    titel,
    beschreibung: '',
    einsatzort: { strasse: 'Hafenweg 3', plz: '24103', ort: 'Kiel', land: 'Deutschland' },
    geplantAm: null,
  });
  return erledigt ? repo.verschiebe(auftrag.id, 'Erledigt') : auftrag;
}

/** 4:30 h und 1:10 h Arbeit, 12 Latten, 1 Anfahrt. */
export async function erfasseLeistungen(
  kontext: RepoKontext,
  auftragId: string,
  daten: Grunddaten,
): Promise<void> {
  const zeiten = new SqliteZeiteintragRepository(kontext);
  const material = new SqliteMaterialeintragRepository(kontext);
  await zeiten.anlegen(auftragId, {
    start: '2026-03-09T07:00:00.000Z',
    ende: '2026-03-09T12:00:00.000Z',
    pauseMinuten: 30,
    taetigkeit: 'Zaun gesetzt',
  });
  await zeiten.anlegen(auftragId, {
    start: '2026-03-10T07:00:00.000Z',
    ende: '2026-03-10T08:10:00.000Z',
    pauseMinuten: 0,
    taetigkeit: 'Zaun gesetzt',
  });
  await material.anlegen(auftragId, { artikelId: daten.latte.id, menge: 12, einzelpreisCent: 895 });
  await material.anlegen(auftragId, {
    artikelId: daten.anfahrt.id,
    menge: 1,
    einzelpreisCent: 2500,
  });
}

/** Entwurfsdaten mit je einer Position Arbeit, Material und Anfahrt (314,40 € netto). */
export function entwurfsdaten(
  kundeId: string,
  auftragId: string | null,
  mehr: Partial<RechnungEntwurfDaten> = {},
): RechnungEntwurfDaten {
  return {
    kundeId,
    auftragId,
    datum: '2026-03-10',
    faelligAm: '2026-03-24',
    leistungsdatum: '2026-03-10',
    positionen: [
      pos('Arbeit', 'Zaun gesetzt', 3.5, 5200),
      pos('Material', 'Zaunlatte Lärche 180 cm', 12, 895),
      pos('Anfahrt', 'Anfahrt Stadtgebiet', 1, 2500),
    ],
    ...mehr,
  };
}
