import type { Content, ContentTable, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { Rechnungsdokument } from '../domain/rechnungsdokument';

const GRAU = '#555555';
const HELL = '#eeeeee';
const rechts = (text: string, mehr: object = {}): TableCell => ({
  text,
  alignment: 'right',
  ...mehr,
});

/** Übersetzt das Dokumentmodell in eine pdfmake-Definition (A4, Briefbogen-Aufbau). */
export function pdfDefinition(d: Rechnungsdokument): TDocumentDefinitions {
  const positionszeilen: TableCell[][] = [
    [
      { text: 'Pos.', style: 'kopf' },
      { text: 'Beschreibung', style: 'kopf' },
      rechts('Menge', { style: 'kopf' }),
      rechts('Einzelpreis', { style: 'kopf' }),
      rechts('MwSt', { style: 'kopf' }),
      rechts('Betrag', { style: 'kopf' }),
    ],
  ];
  for (const gruppe of d.gruppen) {
    positionszeilen.push([
      { text: gruppe.titel, bold: true, colSpan: 6, fillColor: HELL, margin: [0, 2, 0, 2] },
      {},
      {},
      {},
      {},
      {},
    ]);
    for (const p of gruppe.positionen) {
      positionszeilen.push([
        String(p.nr),
        p.beschreibung,
        rechts(p.menge),
        rechts(p.einzelpreis),
        rechts(p.mwst),
        rechts(p.betrag),
      ]);
    }
    positionszeilen.push([
      { text: `Zwischensumme ${gruppe.titel}`, colSpan: 5, alignment: 'right', italics: true },
      {},
      {},
      {},
      {},
      rechts(gruppe.zwischensumme, { italics: true }),
    ]);
  }

  const positionen: ContentTable = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [24, '*', 62, 62, 34, 66],
      body: positionszeilen,
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3),
      vLineWidth: () => 0,
      hLineColor: () => '#999999',
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
  };

  const kopf: Content = {
    columns: [
      d.logo ? { image: d.logo, fit: [170, 64] } : { text: '' },
      {
        width: 'auto',
        alignment: 'right',
        stack: d.absender.map((zeile, i) => ({
          text: zeile,
          bold: i === 0,
          fontSize: i === 0 ? 13 : 9,
        })),
      },
    ],
    margin: [0, 0, 0, 22],
  };

  return {
    info: { title: `${d.titel} ${d.kopfdaten[0]?.wert ?? ''}`.trim(), author: d.absender[0] ?? '' },
    pageSize: 'A4',
    pageMargins: [57, 40, 48, 84],
    defaultStyle: { fontSize: 10, lineHeight: 1.2 },
    styles: { kopf: { bold: true, fontSize: 9, color: GRAU } },
    ...(d.istEntwurf
      ? { watermark: { text: 'ENTWURF', color: '#bb0000', opacity: 0.12, bold: true } }
      : {}),
    content: [
      kopf,
      {
        text: d.absenderzeile,
        fontSize: 7,
        color: GRAU,
        decoration: 'underline',
        margin: [0, 0, 0, 6],
      },
      {
        columns: [
          { width: '*', stack: d.empfaenger.map((zeile) => ({ text: zeile, fontSize: 11 })) },
          {
            width: 'auto',
            table: {
              body: d.kopfdaten.map((z) => [
                { text: z.bezeichnung, color: GRAU },
                { text: z.wert, alignment: 'right' as const, bold: true },
              ]),
            },
            layout: 'noBorders',
          },
        ],
        margin: [0, 0, 0, 26],
      },
      { text: d.titel, fontSize: 17, bold: true, margin: [0, 0, 0, 8] },
      { text: 'Sehr geehrte Damen und Herren,', margin: [0, 0, 0, 4] },
      { text: d.einleitung, margin: [0, 0, 0, 8] },
      positionen,
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            table: {
              body: d.summen.map((z) => [
                {
                  text: z.bezeichnung,
                  bold: z.hervorgehoben === true,
                  fontSize: z.hervorgehoben ? 12 : 10,
                },
                rechts(z.wert, {
                  bold: z.hervorgehoben === true,
                  fontSize: z.hervorgehoben ? 12 : 10,
                }),
              ]),
            },
            layout: {
              hLineWidth: (i, node) => (i === node.table.body.length - 1 ? 0.8 : 0),
              vLineWidth: () => 0,
              paddingTop: () => 3,
              paddingBottom: () => 3,
            },
          },
        ],
        margin: [0, 8, 0, 12],
        unbreakable: true,
      },
      ...d.hinweise.map((hinweis): Content => ({
        text: hinweis,
        fontSize: 9,
        margin: [0, 0, 0, 6],
      })),
    ],
    footer: (seite, seiten) => ({
      margin: [57, 12, 48, 0],
      stack: [
        {
          canvas: [
            { type: 'line', x1: 0, y1: 0, x2: 490, y2: 0, lineWidth: 0.5, lineColor: '#999999' },
          ],
        },
        {
          columns: d.fuss.map((spalte) => ({ stack: [...spalte], fontSize: 7.5, color: GRAU })),
          columnGap: 12,
          margin: [0, 6, 0, 0],
        },
        { text: `Seite ${seite} von ${seiten}`, alignment: 'right', fontSize: 7.5, color: GRAU },
      ],
    }),
  };
}
