import {
  Einstellungen,
  Firmendaten,
  LEERE_FIRMENDATEN,
  STANDARD_EINSTELLUNGEN,
} from '../../domain/firma';
import { EinstellungenRepository, FirmendatenRepository } from '../firma.repository';
import { RepoKontext } from './kontext';

interface FirmendatenZeile {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  telefon: string;
  email: string;
  steuernummer: string;
  ust_id: string;
  bank_inhaber: string;
  bank_iban: string;
  bank_bic: string;
  bank_name: string;
  logo: string | null;
}

export class SqliteFirmendatenRepository implements FirmendatenRepository {
  constructor(private readonly kontext: RepoKontext) {}

  async laden(): Promise<Firmendaten> {
    const [z] = await this.kontext.db.query<FirmendatenZeile>(
      'SELECT * FROM firmendaten WHERE id = 1',
    );
    if (!z) {
      return LEERE_FIRMENDATEN;
    }
    return {
      name: z.name,
      strasse: z.strasse,
      plz: z.plz,
      ort: z.ort,
      land: z.land,
      telefon: z.telefon,
      email: z.email,
      steuernummer: z.steuernummer,
      ustId: z.ust_id,
      bankInhaber: z.bank_inhaber,
      bankIban: z.bank_iban,
      bankBic: z.bank_bic,
      bankName: z.bank_name,
      logo: z.logo,
    };
  }

  async speichern(f: Firmendaten): Promise<void> {
    await this.kontext.db.run(
      `INSERT OR REPLACE INTO firmendaten (id, name, strasse, plz, ort, land, telefon, email,
         steuernummer, ust_id, bank_inhaber, bank_iban, bank_bic, bank_name, logo, geaendert_am)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.name.trim(),
        f.strasse.trim(),
        f.plz.trim(),
        f.ort.trim(),
        f.land.trim(),
        f.telefon.trim(),
        f.email.trim(),
        f.steuernummer.trim(),
        f.ustId.replace(/\s+/g, '').toUpperCase(),
        f.bankInhaber.trim(),
        f.bankIban.replace(/\s+/g, '').toUpperCase(),
        f.bankBic.replace(/\s+/g, '').toUpperCase(),
        f.bankName.trim(),
        f.logo,
        this.kontext.jetzt(),
      ],
    );
  }
}

interface EinstellungenZeile {
  zahlungsziel_tage: number;
  standard_stundensatz_artikel_id: string | null;
  praefix_rechnung: string;
  praefix_auftrag: string;
  praefix_angebot: string;
  text_aufbewahrung: string;
  text_arbeitskosten: string;
  text_zahlung: string;
  text_schluss: string;
}

export class SqliteEinstellungenRepository implements EinstellungenRepository {
  constructor(private readonly kontext: RepoKontext) {}

  async laden(): Promise<Einstellungen> {
    const [z] = await this.kontext.db.query<EinstellungenZeile>(
      'SELECT * FROM einstellungen WHERE id = 1',
    );
    if (!z) {
      return STANDARD_EINSTELLUNGEN;
    }
    return {
      zahlungszielTage: z.zahlungsziel_tage,
      standardStundensatzArtikelId: z.standard_stundensatz_artikel_id,
      praefixRechnung: z.praefix_rechnung,
      praefixAuftrag: z.praefix_auftrag,
      praefixAngebot: z.praefix_angebot,
      textAufbewahrung: z.text_aufbewahrung,
      textArbeitskosten: z.text_arbeitskosten,
      textZahlung: z.text_zahlung,
      textSchluss: z.text_schluss,
    };
  }

  async speichern(e: Einstellungen): Promise<void> {
    if (!Number.isInteger(e.zahlungszielTage) || e.zahlungszielTage < 0) {
      throw new Error('Das Zahlungsziel muss eine ganze Zahl von Tagen sein.');
    }
    for (const praefix of [e.praefixRechnung, e.praefixAuftrag, e.praefixAngebot]) {
      if (!/^[A-Za-z0-9]{1,6}$/.test(praefix)) {
        throw new Error('Nummern-Präfixe bestehen aus 1 bis 6 Buchstaben oder Ziffern.');
      }
    }
    await this.kontext.db.run(
      `INSERT OR REPLACE INTO einstellungen (id, zahlungsziel_tage,
         standard_stundensatz_artikel_id, praefix_rechnung, praefix_auftrag, praefix_angebot,
         text_aufbewahrung, text_arbeitskosten, text_zahlung, text_schluss, geaendert_am)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.zahlungszielTage,
        e.standardStundensatzArtikelId,
        e.praefixRechnung,
        e.praefixAuftrag,
        e.praefixAngebot,
        e.textAufbewahrung.trim(),
        e.textArbeitskosten.trim(),
        e.textZahlung.trim(),
        e.textSchluss.trim(),
        this.kontext.jetzt(),
      ],
    );
  }
}
