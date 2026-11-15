import { TEST_FIRMA, pos } from '../../testing/fixtures';
import { STANDARD_EINSTELLUNGEN } from './firma';
import { Rechnung, RechnungspositionDaten } from './rechnung';
import { baueRechnungsdokument, bruttoJeTyp, dokumentText } from './rechnungsdokument';
import { summenVon } from './rechnung';

const POSITIONEN = [
  pos('Arbeit', 'Zaun gesetzt', 3.5, 5200),
  pos('Material', 'Zaunlatte Lärche 180 cm', 12, 895),
  pos('Material', 'Schrauben', 1, 450),
  pos('Anfahrt', 'Anfahrt Stadtgebiet', 1, 2500),
];

function rechnung(
  mehr: Partial<Rechnung> = {},
  positionen: RechnungspositionDaten[] = POSITIONEN,
): Rechnung {
  const summen = summenVon(positionen);
  return {
    id: 'r1',
    nummer: 'RE-2026-0007',
    kundeId: 'k1',
    auftragId: 'a1',
    datum: '2026-03-12',
    faelligAm: '2026-03-26',
    leistungsdatum: '2026-03-10',
    status: 'Versendet',
    summeNettoCent: summen.nettoCent,
    summeMwstCent: summen.mwstCent,
    summeBruttoCent: summen.bruttoCent,
    empfaenger: {
      typ: 'Privat',
      firma: '',
      name: 'Erika Müller',
      strasse: 'Hafenweg 3',
      plz: '24103',
      ort: 'Kiel',
      land: 'Deutschland',
      ustId: '',
    },
    stornoVonRechnungId: null,
    positionen: positionen.map((p, i) => ({ ...p, id: `p${i}`, position: i + 1 })),
    ...mehr,
  };
}

const GEWERBE = {
  typ: 'Gewerbe' as const,
  firma: 'Bäckerei Hansen GmbH',
  name: 'Ole Hansen',
  strasse: 'Am Markt 1',
  plz: '23552',
  ort: 'Lübeck',
  land: 'Deutschland',
  ustId: 'DE987654321',
};

const baue = (r = rechnung(), original: Parameters<typeof baueRechnungsdokument>[3] = null) =>
  baueRechnungsdokument(r, TEST_FIRMA, STANDARD_EINSTELLUNGEN, original);

describe('baueRechnungsdokument', () => {
  it('enthält alle Pflichtangaben nach § 14 Abs. 4 UStG', () => {
    const text = dokumentText(baue());
    // 1. Name und Anschrift des leistenden Unternehmers und des Empfängers
    expect(text).toContain('Haustechnik Clausen · Werftstraße 12 · 24103 Kiel');
    expect(text).toContain('Erika Müller\nHafenweg 3\n24103 Kiel');
    // 2. Steuernummer oder USt-IdNr.
    expect(text).toContain('Steuernummer 20/123/45678');
    expect(text).toContain('USt-IdNr. DE123456789');
    // 3. Ausstellungsdatum, 4. fortlaufende Rechnungsnummer
    expect(text).toContain('Rechnungsdatum\n12.03.2026');
    expect(text).toContain('Rechnungsnummer\nRE-2026-0007');
    // 5. Menge und Art der Leistung
    expect(text).toContain('Zaun gesetzt\n3,5 Std');
    expect(text).toContain('Zaunlatte Lärche 180 cm\n12 Stk');
    // 6. Zeitpunkt der Leistung
    expect(text).toContain('Leistungsdatum\n10.03.2026');
    // 7./8. Entgelt nach Steuersätzen, Steuersatz und Steuerbetrag
    expect(text).toContain('Summe netto\n318,90 €');
    expect(text).toContain('zzgl. 19 % MwSt auf 318,90 €\n60,59 €');
    expect(text).toContain('Rechnungsbetrag\n379,49 €');
  });

  it('weist Arbeit, Material und Anfahrt in drei getrennten Gruppen mit Zwischensummen aus', () => {
    const d = baue();
    expect(d.gruppen.map((g) => [g.titel, g.positionen.length, g.zwischensumme])).toEqual([
      ['Arbeitsleistungen', 1, '182,00 €'],
      ['Material', 2, '111,90 €'],
      ['Anfahrt', 1, '25,00 €'],
    ]);
    expect(d.gruppen.flatMap((g) => g.positionen.map((p) => p.nr))).toEqual([1, 2, 3, 4]);
    expect(d.gruppen[1].positionen[0]).toEqual({
      nr: 2,
      beschreibung: 'Zaunlatte Lärche 180 cm',
      menge: '12 Stk',
      einzelpreis: '8,95 €',
      mwst: '19 %',
      betrag: '107,40 €',
    });
  });

  it('gruppiert nach Typ, auch wenn die Positionen gemischt gespeichert sind', () => {
    const d = baue(
      rechnung({}, [
        pos('Material', 'Latte', 1, 100),
        pos('Arbeit', 'Montage', 1, 100),
        pos('Material', 'Schraube', 1, 100),
      ]),
    );
    expect(d.gruppen.map((g) => g.positionen.map((p) => p.beschreibung))).toEqual([
      ['Montage'],
      ['Latte', 'Schraube'],
    ]);
  });

  it('lässt leere Gruppen weg', () => {
    const d = baue(rechnung({}, [pos('Material', 'Latte', 2, 895)]));
    expect(d.gruppen.map((g) => g.titel)).toEqual(['Material']);
  });

  it('listet gemischte Steuersätze einzeln auf', () => {
    const d = baue(
      rechnung({}, [
        pos('Arbeit', 'Montage', 1, 10000),
        pos('Material', 'Buch', 1, 5000, { mwstSatz: 7 }),
      ]),
    );
    expect(d.summen.map((z) => [z.bezeichnung, z.wert])).toEqual([
      ['Summe netto', '150,00 €'],
      ['zzgl. 7 % MwSt auf 50,00 €', '3,50 €'],
      ['zzgl. 19 % MwSt auf 100,00 €', '19,00 €'],
      ['Rechnungsbetrag', '172,50 €'],
    ]);
    expect(d.summen[3].hervorgehoben).toBe(true);
  });

  describe('Privatkunden', () => {
    it('erhalten den Hinweis auf die zweijährige Aufbewahrungspflicht', () => {
      const hinweise = baue().hinweise.join('\n');
      expect(hinweise).toContain('zwei Jahre');
      expect(hinweise).toContain('§ 14 Abs. 4 Satz 1 Nr. 9 UStG');
    });

    it('erhalten den Ausweis der Arbeits- und Fahrtkosten einschließlich MwSt (§ 35a EStG)', () => {
      const hinweise = baue().hinweise.join('\n');
      // Arbeit 182,00 + 34,58 MwSt; Anfahrt 25,00 + 4,75 MwSt
      expect(hinweise).toContain('Arbeitskosten in Höhe von 216,58 €');
      expect(hinweise).toContain('Fahrtkosten in Höhe von 29,75 €');
      expect(hinweise).toContain('§ 35a EStG');
    });

    it('erhalten keinen § 35a-Ausweis bei reinen Materialrechnungen', () => {
      const hinweise = baue(rechnung({}, [pos('Material', 'Latte', 2, 895)])).hinweise.join('\n');
      expect(hinweise).not.toContain('§ 35a');
      expect(hinweise).toContain('zwei Jahre');
    });
  });

  describe('Gewerbekunden', () => {
    const d = baue(rechnung({ empfaenger: GEWERBE }));

    it('erhalten weder Aufbewahrungshinweis noch § 35a-Ausweis', () => {
      const hinweise = d.hinweise.join('\n');
      expect(hinweise).not.toContain('zwei Jahre');
      expect(hinweise).not.toContain('§ 35a');
    });

    it('werden mit Firma, Ansprechperson und USt-IdNr. adressiert', () => {
      expect(d.empfaenger).toEqual([
        'Bäckerei Hansen GmbH',
        'Ole Hansen',
        'Am Markt 1',
        '23552 Lübeck',
      ]);
      expect(d.kopfdaten).toContainEqual({ bezeichnung: 'Ihre USt-IdNr.', wert: 'DE987654321' });
    });
  });

  it('nennt Fälligkeit und Rechnungsnummer in den Zahlungsbedingungen', () => {
    expect(baue().hinweise[0]).toContain('bis zum 26.03.2026');
    expect(baue().hinweise[0]).toContain('RE-2026-0007');
    expect(baue().hinweise.at(-1)).toBe('Vielen Dank für Ihren Auftrag!');
  });

  it('nennt die Bankverbindung in der Fußzeile', () => {
    expect(baue().fuss[1]).toEqual([
      'Commerzbank',
      'Inhaber: Jan Clausen',
      'IBAN DE89 3704 0044 0532 0130 00',
      'BIC COBADEFFXXX',
    ]);
  });

  it('kennzeichnet Entwürfe', () => {
    const d = baue(rechnung({ status: 'Entwurf', nummer: null }));
    expect(d.istEntwurf).toBe(true);
    expect(d.titel).toBe('Rechnungsentwurf');
    expect(d.kopfdaten[0]).toEqual({ bezeichnung: 'Rechnungsnummer', wert: 'Entwurf' });
    expect(d.dateiname).toBe('Rechnungsentwurf-Entwurf.pdf');
    expect(baue().istEntwurf).toBe(false);
    expect(baue().dateiname).toBe('Rechnung-RE-2026-0007.pdf');
  });

  it('ersetzt bei bezahlten Rechnungen die Zahlungsaufforderung', () => {
    const hinweise = baue(rechnung({ status: 'Bezahlt' })).hinweise;
    expect(hinweise[0]).toContain('bereits bezahlt');
    expect(hinweise.join('\n')).not.toContain('überweisen');
  });

  it('baut eine Stornorechnung mit Verweis auf das Original und negativen Beträgen', () => {
    const storno = rechnung(
      { nummer: 'RE-2026-0008', stornoVonRechnungId: 'r1', datum: '2026-03-20' },
      POSITIONEN.map((p) => ({ ...p, menge: -p.menge })),
    );
    const d = baue(storno, { nummer: 'RE-2026-0007', datum: '2026-03-12' });
    expect(d.titel).toBe('Stornorechnung');
    expect(d.kopfdaten).toContainEqual({ bezeichnung: 'Storno zu Rechnung', wert: 'RE-2026-0007' });
    expect(d.hinweise).toEqual([
      'Diese Stornorechnung hebt die Rechnung RE-2026-0007 vom 12.03.2026 vollständig auf.',
    ]);
    expect(d.summen.at(-1)).toMatchObject({ bezeichnung: 'Gutschriftsbetrag', wert: '-379,49 €' });
    expect(d.gruppen[0].positionen[0].menge).toBe('-3,5 Std');
    expect(d.gruppen[0].zwischensumme).toBe('-182,00 €');
  });

  it('übernimmt das Logo der Firma', () => {
    const d = baueRechnungsdokument(
      rechnung(),
      { ...TEST_FIRMA, logo: 'data:image/png;base64,AAAA' },
      STANDARD_EINSTELLUNGEN,
    );
    expect(d.logo).toBe('data:image/png;base64,AAAA');
    expect(baue().logo).toBeNull();
  });
});

describe('bruttoJeTyp', () => {
  it('rechnet die MwSt je Steuersatz und summiert', () => {
    const positionen = [
      pos('Arbeit', 'A', 1, 10000),
      pos('Arbeit', 'B', 1, 5000, { mwstSatz: 7 }),
      pos('Material', 'C', 1, 99999),
    ];
    expect(bruttoJeTyp(positionen, 'Arbeit')).toBe(11900 + 5350);
    expect(bruttoJeTyp(positionen, 'Anfahrt')).toBe(0);
  });
});
