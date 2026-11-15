import {
  formatiereBetrag,
  formatiereEuro,
  mwstCent,
  parseEuro,
  positionsbetragCent,
  teileGerundet,
} from './geld';

describe('teileGerundet', () => {
  it('rundet kaufmännisch an der 0,5-Grenze', () => {
    expect(teileGerundet(149, 100)).toBe(1);
    expect(teileGerundet(150, 100)).toBe(2);
    expect(teileGerundet(250, 100)).toBe(3); // kein „Banker's Rounding"
    expect(teileGerundet(1, 3)).toBe(0);
    expect(teileGerundet(2, 3)).toBe(1);
  });

  it('rundet negative Werte vom Nullpunkt weg', () => {
    expect(teileGerundet(-150, 100)).toBe(-2);
    expect(teileGerundet(-149, 100)).toBe(-1);
  });

  it('liefert nie -0', () => {
    expect(Object.is(teileGerundet(-1, 100), 0)).toBe(true);
  });

  it('lehnt nicht ganzzahlige Werte ab', () => {
    expect(() => teileGerundet(1.5, 100)).toThrow();
    expect(() => teileGerundet(1, 0)).toThrow();
  });
});

describe('positionsbetragCent', () => {
  it('multipliziert Menge und Einzelpreis', () => {
    expect(positionsbetragCent(2, 4550)).toBe(9100);
    expect(positionsbetragCent(1.5, 5200)).toBe(7800);
  });

  it('erzeugt keine Fließkomma-Artefakte', () => {
    expect(positionsbetragCent(3, 10)).toBe(30); // 3 × 0,10 €
    expect(positionsbetragCent(0.1, 30)).toBe(3);
    expect(positionsbetragCent(1.005, 1000)).toBe(1005);
    expect(positionsbetragCent(2.675, 100)).toBe(268);
  });

  it('rundet halbe Cent auf', () => {
    expect(positionsbetragCent(0.5, 1)).toBe(1);
    expect(positionsbetragCent(0.25, 2)).toBe(1);
    expect(positionsbetragCent(0.333, 100)).toBe(33);
  });

  it('rechnet negative Mengen für Stornos', () => {
    expect(positionsbetragCent(-1.5, 5200)).toBe(-7800);
    expect(positionsbetragCent(-0.5, 1)).toBe(-1);
  });

  it('lehnt Preise ab, die keine ganzen Cent sind', () => {
    expect(() => positionsbetragCent(1, 12.5)).toThrow();
    expect(() => positionsbetragCent(Number.NaN, 100)).toThrow();
  });
});

describe('mwstCent', () => {
  it('berechnet 19 %, 7 % und 0 %', () => {
    expect(mwstCent(10000, 19)).toBe(1900);
    expect(mwstCent(10000, 7)).toBe(700);
    expect(mwstCent(10000, 0)).toBe(0);
  });

  it('rundet kaufmännisch', () => {
    expect(mwstCent(50, 19)).toBe(10); // 9,5
    expect(mwstCent(1, 19)).toBe(0); // 0,19
    expect(mwstCent(3, 19)).toBe(1); // 0,57
    expect(mwstCent(-50, 19)).toBe(-10);
  });

  it('lehnt ungültige Steuersätze ab', () => {
    expect(() => mwstCent(100, 19.5)).toThrow();
    expect(() => mwstCent(100, -1)).toThrow();
  });
});

describe('Formatierung', () => {
  it('formatiert Cent als Euro', () => {
    expect(formatiereEuro(0)).toBe('0,00 €');
    expect(formatiereEuro(5)).toBe('0,05 €');
    expect(formatiereEuro(1250)).toBe('12,50 €');
    expect(formatiereEuro(123456)).toBe('1.234,56 €');
    expect(formatiereEuro(123456789)).toBe('1.234.567,89 €');
    expect(formatiereEuro(-1250)).toBe('-12,50 €');
    expect(formatiereBetrag(100000)).toBe('1.000,00');
  });

  it('lehnt Nicht-Integer ab', () => {
    expect(() => formatiereEuro(12.5)).toThrow();
  });
});

describe('parseEuro', () => {
  it.each([
    ['12,50', 1250],
    ['12,5', 1250],
    ['12', 1200],
    ['0,05', 5],
    ['1.234,56', 123456],
    ['1.234', 123400],
    ['1234,56 €', 123456],
    [' 12,50 ', 1250],
    ['12.50', 1250],
    ['12.5', 1250],
    ['-3', -300],
    ['-0,00', 0],
    ['0,29', 29],
    ['19,99', 1999],
  ])('liest „%s" als %i Cent', (eingabe, cent) => {
    expect(parseEuro(eingabe)).toBe(cent);
  });

  it.each(['', '   ', 'abc', '12,345', '1,2,3', '12,', ',50', '1.23.4,00', '12 Euro', '--3'])(
    'lehnt „%s" ab',
    (eingabe) => {
      expect(parseEuro(eingabe)).toBeNull();
    },
  );

  it('ist die Umkehrung der Formatierung', () => {
    for (const cent of [0, 1, 99, 100, 1999, 123456, 99999999, -4711]) {
      expect(parseEuro(formatiereEuro(cent))).toBe(cent);
    }
  });
});
