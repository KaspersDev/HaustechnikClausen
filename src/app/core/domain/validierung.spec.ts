import {
  formatiereIban,
  istGueltigeEmail,
  istGueltigeIban,
  istGueltigePlz,
  istGueltigeUstId,
} from './validierung';

describe('istGueltigeIban', () => {
  it.each([
    'DE89370400440532013000',
    'DE89 3704 0044 0532 0130 00',
    'de89370400440532013000',
    'AT611904300234573201',
    'GB82WEST12345698765432',
  ])('akzeptiert %s', (iban) => {
    expect(istGueltigeIban(iban)).toBe(true);
  });

  it.each([
    '',
    'DE89370400440532013001', // falsche Prüfziffer
    'DE8937040044053201300', // zu kurz für DE
    'DE893704004405320130000',
    '1234',
    'XX00',
    'DE89-3704-0044-0532-0130-00',
  ])('lehnt „%s" ab', (iban) => {
    expect(istGueltigeIban(iban)).toBe(false);
  });
});

it('formatiert IBANs in Vierergruppen', () => {
  expect(formatiereIban('de89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  expect(formatiereIban('')).toBe('');
});

it('prüft E-Mail-Adressen', () => {
  expect(istGueltigeEmail('info@haustechnik-clausen.de')).toBe(true);
  expect(istGueltigeEmail(' a.b@c.de ')).toBe(true);
  for (const falsch of ['', 'info', 'info@', 'info@firma', '@firma.de', 'a b@c.de']) {
    expect(istGueltigeEmail(falsch)).toBe(false);
  }
});

it('prüft Postleitzahlen abhängig vom Land', () => {
  expect(istGueltigePlz('24103', 'Deutschland')).toBe(true);
  expect(istGueltigePlz('24103', '')).toBe(true);
  expect(istGueltigePlz('2410', 'Deutschland')).toBe(false);
  expect(istGueltigePlz('ABCDE', 'Deutschland')).toBe(false);
  expect(istGueltigePlz('6000', 'Dänemark')).toBe(true);
  expect(istGueltigePlz('', 'Dänemark')).toBe(false);
});

it('prüft USt-IdNr.', () => {
  expect(istGueltigeUstId('DE123456789')).toBe(true);
  expect(istGueltigeUstId('de 123 456 789')).toBe(true);
  expect(istGueltigeUstId('DE12345678')).toBe(false);
  expect(istGueltigeUstId('ATU12345678')).toBe(true);
  expect(istGueltigeUstId('123')).toBe(false);
});
