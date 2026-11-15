import { formatiereDatum } from './datum';
import { Einstellungen, Firmendaten } from './firma';
import { formatiereEuro, mwstCent, positionsbetragCent } from './geld';
import { kundenname } from './kunde';
import { Rechnung, RechnungspositionDaten, istStornorechnung, summenVon } from './rechnung';
import { POSITIONSTYPEN, PositionsTyp } from './typen';
import { formatiereIban } from './validierung';

/** Überschriften der drei getrennt ausgewiesenen Gruppen (§ 35a EStG). */
export const GRUPPENTITEL: Readonly<Record<PositionsTyp, string>> = {
  Arbeit: 'Arbeitsleistungen',
  Material: 'Material',
  Anfahrt: 'Anfahrt',
};

export interface DokumentZeile {
  readonly bezeichnung: string;
  readonly wert: string;
  readonly hervorgehoben?: boolean;
}

export interface DokumentPosition {
  readonly nr: number;
  readonly beschreibung: string;
  readonly menge: string;
  readonly einzelpreis: string;
  readonly mwst: string;
  readonly betrag: string;
}

export interface DokumentGruppe {
  readonly typ: PositionsTyp;
  readonly titel: string;
  readonly positionen: readonly DokumentPosition[];
  readonly zwischensumme: string;
}

/** Alles, was auf der Rechnung steht – fertig formatiert und unabhängig von der PDF-Bibliothek. */
export interface Rechnungsdokument {
  readonly titel: string;
  readonly istEntwurf: boolean;
  readonly logo: string | null;
  readonly absender: readonly string[];
  /** Einzeilige Absenderangabe über dem Anschriftfeld. */
  readonly absenderzeile: string;
  readonly empfaenger: readonly string[];
  readonly kopfdaten: readonly DokumentZeile[];
  readonly einleitung: string;
  readonly gruppen: readonly DokumentGruppe[];
  readonly summen: readonly DokumentZeile[];
  readonly hinweise: readonly string[];
  /** Drei Spalten der Fußzeile: Kontakt, Bank, Steuer. */
  readonly fuss: readonly (readonly string[])[];
  readonly dateiname: string;
}

/** Nummer und Datum der Rechnung, die eine Stornorechnung aufhebt. */
export interface OriginalRechnung {
  readonly nummer: string | null;
  readonly datum: string;
}

const formatiereMenge = (menge: number): string =>
  (Math.round(menge * 1000) / 1000).toString().replace('.', ',');

const zeilen = (...werte: (string | false | null | undefined)[]): string[] =>
  werte.filter((w): w is string => typeof w === 'string' && w.trim() !== '');

/** Bruttobetrag der Positionen eines Typs (MwSt je Steuersatz auf die Netto-Summe). */
export function bruttoJeTyp(
  positionen: readonly RechnungspositionDaten[],
  typ: PositionsTyp,
): number {
  const nettoJeSatz = new Map<number, number>();
  for (const p of positionen.filter((x) => x.typ === typ)) {
    nettoJeSatz.set(
      p.mwstSatz,
      (nettoJeSatz.get(p.mwstSatz) ?? 0) + positionsbetragCent(p.menge, p.einzelpreisCent),
    );
  }
  let brutto = 0;
  for (const [satz, netto] of nettoJeSatz) {
    brutto += netto + mwstCent(netto, satz);
  }
  return brutto;
}

export function baueRechnungsdokument(
  rechnung: Rechnung,
  firma: Firmendaten,
  einstellungen: Einstellungen,
  original: OriginalRechnung | null = null,
): Rechnungsdokument {
  const istEntwurf = rechnung.status === 'Entwurf';
  const istStorno = istStornorechnung(rechnung);
  const istPrivat = rechnung.empfaenger.typ === 'Privat';
  const titel = istStorno ? 'Stornorechnung' : istEntwurf ? 'Rechnungsentwurf' : 'Rechnung';
  const nummer = rechnung.nummer ?? 'Entwurf';
  const e = rechnung.empfaenger;

  let nr = 0;
  const gruppen: DokumentGruppe[] = POSITIONSTYPEN.map((typ) => {
    const positionen = rechnung.positionen.filter((p) => p.typ === typ);
    return {
      typ,
      titel: GRUPPENTITEL[typ],
      positionen: positionen.map((p) => ({
        nr: ++nr,
        beschreibung: p.beschreibung,
        menge: `${formatiereMenge(p.menge)} ${p.einheit}`.trim(),
        einzelpreis: formatiereEuro(p.einzelpreisCent),
        mwst: `${p.mwstSatz} %`,
        betrag: formatiereEuro(positionsbetragCent(p.menge, p.einzelpreisCent)),
      })),
      zwischensumme: formatiereEuro(
        positionen.reduce((s, p) => s + positionsbetragCent(p.menge, p.einzelpreisCent), 0),
      ),
    };
  }).filter((gruppe) => gruppe.positionen.length > 0);

  const summen = summenVon(rechnung.positionen);
  const summenzeilen: DokumentZeile[] = [
    { bezeichnung: 'Summe netto', wert: formatiereEuro(summen.nettoCent) },
    ...summen.jeSteuersatz.map((s) => ({
      bezeichnung: `zzgl. ${s.mwstSatz} % MwSt auf ${formatiereEuro(s.nettoCent)}`,
      wert: formatiereEuro(s.mwstCent),
    })),
    {
      bezeichnung: istStorno ? 'Gutschriftsbetrag' : 'Rechnungsbetrag',
      wert: formatiereEuro(summen.bruttoCent),
      hervorgehoben: true,
    },
  ];

  const hinweise: string[] = [];
  if (istStorno) {
    hinweise.push(
      `Diese Stornorechnung hebt die Rechnung ${original?.nummer ?? ''} vom ${formatiereDatum(original?.datum)} vollständig auf.`
        .replace(/\s+/g, ' ')
        .trim(),
    );
  } else {
    if (rechnung.status === 'Bezahlt') {
      hinweise.push('Der Rechnungsbetrag wurde bereits bezahlt. Vielen Dank.');
    } else if (einstellungen.textZahlung.trim() !== '') {
      hinweise.push(
        einstellungen.textZahlung
          .replaceAll('{faelligAm}', formatiereDatum(rechnung.faelligAm))
          .replaceAll('{nummer}', rechnung.nummer ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
    if (istPrivat) {
      const arbeit = bruttoJeTyp(rechnung.positionen, 'Arbeit');
      const anfahrt = bruttoJeTyp(rechnung.positionen, 'Anfahrt');
      if ((arbeit !== 0 || anfahrt !== 0) && einstellungen.textArbeitskosten.trim() !== '') {
        hinweise.push(
          einstellungen.textArbeitskosten
            .replaceAll('{arbeit}', formatiereEuro(arbeit))
            .replaceAll('{anfahrt}', formatiereEuro(anfahrt)),
        );
      }
      if (einstellungen.textAufbewahrung.trim() !== '') {
        hinweise.push(einstellungen.textAufbewahrung);
      }
    }
    if (einstellungen.textSchluss.trim() !== '') {
      hinweise.push(einstellungen.textSchluss);
    }
  }

  const firmaOrt = `${firma.plz} ${firma.ort}`.trim();
  return {
    titel,
    istEntwurf,
    logo: firma.logo,
    absender: zeilen(firma.name, firma.strasse, firmaOrt),
    absenderzeile: zeilen(firma.name, firma.strasse, firmaOrt).join(' · '),
    empfaenger: zeilen(
      kundenname(e),
      e.typ === 'Gewerbe' && e.firma.trim() !== '' && e.name,
      e.strasse,
      `${e.plz} ${e.ort}`.trim(),
      !['', 'deutschland'].includes(e.land.trim().toLowerCase()) && e.land,
    ),
    kopfdaten: [
      { bezeichnung: istStorno ? 'Stornorechnung Nr.' : 'Rechnungsnummer', wert: nummer },
      { bezeichnung: 'Rechnungsdatum', wert: formatiereDatum(rechnung.datum) },
      { bezeichnung: 'Leistungsdatum', wert: formatiereDatum(rechnung.leistungsdatum) },
      ...(istStorno && original
        ? [{ bezeichnung: 'Storno zu Rechnung', wert: original.nummer ?? '' }]
        : []),
      ...(e.typ === 'Gewerbe' && e.ustId ? [{ bezeichnung: 'Ihre USt-IdNr.', wert: e.ustId }] : []),
    ],
    einleitung: istStorno
      ? 'hiermit stornieren wir die folgenden Leistungen:'
      : 'für unsere Leistungen berechnen wir Ihnen:',
    gruppen,
    summen: summenzeilen,
    hinweise,
    fuss: [
      zeilen(
        firma.name,
        firma.strasse,
        firmaOrt,
        firma.telefon && `Tel. ${firma.telefon}`,
        firma.email,
      ),
      zeilen(
        firma.bankName,
        firma.bankInhaber && `Inhaber: ${firma.bankInhaber}`,
        firma.bankIban && `IBAN ${formatiereIban(firma.bankIban)}`,
        firma.bankBic && `BIC ${firma.bankBic}`,
      ),
      zeilen(
        firma.steuernummer && `Steuernummer ${firma.steuernummer}`,
        firma.ustId && `USt-IdNr. ${firma.ustId}`,
      ),
    ],
    dateiname: `${titel}-${nummer}.pdf`.replace(/[^\wäöüÄÖÜß.-]+/g, '_'),
  };
}

/** Der gesamte sichtbare Text eines Dokuments, für Prüfungen und Tests. */
export function dokumentText(d: Rechnungsdokument): string {
  return [
    d.titel,
    d.absenderzeile,
    ...d.empfaenger,
    ...d.kopfdaten.flatMap((z) => [z.bezeichnung, z.wert]),
    d.einleitung,
    ...d.gruppen.flatMap((g) => [
      g.titel,
      ...g.positionen.flatMap((p) => [p.beschreibung, p.menge, p.einzelpreis, p.mwst, p.betrag]),
      g.zwischensumme,
    ]),
    ...d.summen.flatMap((z) => [z.bezeichnung, z.wert]),
    ...d.hinweise,
    ...d.fuss.flat(),
  ].join('\n');
}
