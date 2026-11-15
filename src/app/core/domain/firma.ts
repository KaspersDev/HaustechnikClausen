export interface Firmendaten {
  readonly name: string;
  readonly strasse: string;
  readonly plz: string;
  readonly ort: string;
  readonly land: string;
  readonly telefon: string;
  readonly email: string;
  readonly steuernummer: string;
  readonly ustId: string;
  readonly bankInhaber: string;
  readonly bankIban: string;
  readonly bankBic: string;
  readonly bankName: string;
  /** Logo als Data-URL (PNG/JPEG) oder `null`. */
  readonly logo: string | null;
}

export interface Einstellungen {
  readonly zahlungszielTage: number;
  /** Artikel vom Typ „Arbeit", mit dem Zeiten auf der Rechnung bewertet werden. */
  readonly standardStundensatzArtikelId: string | null;
  readonly praefixRechnung: string;
  readonly praefixAuftrag: string;
  readonly praefixAngebot: string;
  /** Hinweis für Privatkunden auf die zweijährige Aufbewahrungspflicht. */
  readonly textAufbewahrung: string;
  /** Ausweis der Arbeits- und Fahrtkosten; Platzhalter {arbeit} und {anfahrt}. */
  readonly textArbeitskosten: string;
  /** Zahlungsbedingungen; Platzhalter {faelligAm} und {nummer}. */
  readonly textZahlung: string;
  readonly textSchluss: string;
}

export const LEERE_FIRMENDATEN: Firmendaten = {
  name: '',
  strasse: '',
  plz: '',
  ort: '',
  land: 'Deutschland',
  telefon: '',
  email: '',
  steuernummer: '',
  ustId: '',
  bankInhaber: '',
  bankIban: '',
  bankBic: '',
  bankName: '',
  logo: null,
};

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  zahlungszielTage: 14,
  standardStundensatzArtikelId: null,
  praefixRechnung: 'RE',
  praefixAuftrag: 'AU',
  praefixAngebot: 'AN',
  textAufbewahrung:
    'Hinweis nach § 14 Abs. 4 Satz 1 Nr. 9 UStG: Als Privatperson sind Sie verpflichtet, ' +
    'diese Rechnung, einen Zahlungsbeleg oder eine andere beweiskräftige Unterlage zwei Jahre ' +
    'lang aufzubewahren. Die Frist beginnt mit dem Schluss des Kalenderjahres, in dem die ' +
    'Rechnung ausgestellt wurde.',
  textArbeitskosten:
    'Im Rechnungsbetrag sind Arbeitskosten in Höhe von {arbeit} und Fahrtkosten in Höhe von ' +
    '{anfahrt} enthalten (jeweils einschließlich Mehrwertsteuer, § 35a EStG).',
  textZahlung:
    'Bitte überweisen Sie den Rechnungsbetrag bis zum {faelligAm} ohne Abzug auf das unten ' +
    'genannte Konto und geben Sie dabei die Rechnungsnummer {nummer} an.',
  textSchluss: 'Vielen Dank für Ihren Auftrag!',
};

/** Angaben, ohne die keine Rechnung festgeschrieben werden darf (§ 14 Abs. 4 UStG). */
export function fehlendeFirmenangaben(firma: Firmendaten): string[] {
  const fehlend: string[] = [];
  if (firma.name.trim() === '') fehlend.push('Firmenname');
  if (firma.strasse.trim() === '' || firma.plz.trim() === '' || firma.ort.trim() === '') {
    fehlend.push('Anschrift');
  }
  if (firma.steuernummer.trim() === '' && firma.ustId.trim() === '') {
    fehlend.push('Steuernummer oder USt-IdNr.');
  }
  return fehlend;
}
