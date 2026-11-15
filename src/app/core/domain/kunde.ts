export const KUNDENTYPEN = ['Privat', 'Gewerbe'] as const;
export type KundenTyp = (typeof KUNDENTYPEN)[number];

export interface Adresse {
  readonly strasse: string;
  readonly plz: string;
  readonly ort: string;
  readonly land: string;
}

export interface KundeDaten extends Adresse {
  readonly typ: KundenTyp;
  /** Bei Gewerbekunden der Firmenname. */
  readonly firma: string;
  /** Bei Privatkunden der Name, bei Gewerbekunden die Ansprechperson. */
  readonly name: string;
  readonly email: string;
  readonly telefon: string;
  readonly ustId: string;
}

export interface Kunde extends KundeDaten {
  readonly id: string;
  readonly erstelltAm: string;
  readonly geloeschtAm: string | null;
}

export const LEERER_KUNDE: KundeDaten = {
  typ: 'Privat',
  firma: '',
  name: '',
  strasse: '',
  plz: '',
  ort: '',
  land: 'Deutschland',
  email: '',
  telefon: '',
  ustId: '',
};

/** Name für Listen und Karten: Firma bei Gewerbe, sonst der Name. */
export function kundenname(kunde: Pick<KundeDaten, 'typ' | 'firma' | 'name'>): string {
  return (kunde.typ === 'Gewerbe' && kunde.firma.trim() !== '' ? kunde.firma : kunde.name).trim();
}

export function adresszeile(adresse: Pick<Adresse, 'strasse' | 'plz' | 'ort'>): string {
  const ort = `${adresse.plz} ${adresse.ort}`.trim();
  return [adresse.strasse.trim(), ort].filter(Boolean).join(', ');
}

/** Fachliche Prüfung; liefert Fehlermeldungen (leer = gültig). */
export function pruefeKunde(daten: KundeDaten): string[] {
  const fehler: string[] = [];
  if (daten.typ === 'Gewerbe' && daten.firma.trim() === '') {
    fehler.push('Bei Gewerbekunden ist die Firma erforderlich.');
  }
  if (daten.typ === 'Privat' && daten.name.trim() === '') {
    fehler.push('Bei Privatkunden ist der Name erforderlich.');
  }
  return fehler;
}

/** Für eine Rechnung nötige Angaben: Name und vollständige Anschrift. */
export function fehlendeRechnungsangaben(
  kunde: Pick<KundeDaten, 'typ' | 'firma' | 'name' | 'strasse' | 'plz' | 'ort'>,
): string[] {
  const fehlend: string[] = [];
  if (kundenname(kunde) === '') fehlend.push('Name des Kunden');
  if (kunde.strasse.trim() === '' || kunde.plz.trim() === '' || kunde.ort.trim() === '') {
    fehlend.push('Anschrift des Kunden');
  }
  return fehlend;
}
