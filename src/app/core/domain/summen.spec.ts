import { SummenPosition, berechneSummen } from './summen';

const pos = (
  menge: number,
  einzelpreisCent: number,
  mwstSatz: number,
  typ: SummenPosition['typ'],
): SummenPosition => ({ menge, einzelpreisCent, mwstSatz, typ });

describe('berechneSummen', () => {
  it('liefert Nullen ohne Positionen', () => {
    expect(berechneSummen([])).toEqual({
      nettoCent: 0,
      mwstCent: 0,
      bruttoCent: 0,
      jeSteuersatz: [],
      jeTyp: { Arbeit: 0, Material: 0, Anfahrt: 0 },
    });
  });

  it('berechnet Netto, MwSt und Brutto', () => {
    const summen = berechneSummen([
      pos(3.5, 5200, 19, 'Arbeit'), // 182,00
      pos(12, 895, 19, 'Material'), // 107,40
      pos(1, 2500, 19, 'Anfahrt'), // 25,00
    ]);
    expect(summen.nettoCent).toBe(31440);
    expect(summen.mwstCent).toBe(5974); // 59,736
    expect(summen.bruttoCent).toBe(37414);
  });

  it('weist Arbeit, Material und Anfahrt getrennt aus', () => {
    const summen = berechneSummen([
      pos(2, 5200, 19, 'Arbeit'),
      pos(1.25, 5200, 19, 'Arbeit'),
      pos(4, 1999, 19, 'Material'),
      pos(1, 2500, 19, 'Anfahrt'),
    ]);
    expect(summen.jeTyp).toEqual({ Arbeit: 16900, Material: 7996, Anfahrt: 2500 });
    expect(summen.jeTyp.Arbeit + summen.jeTyp.Material + summen.jeTyp.Anfahrt).toBe(
      summen.nettoCent,
    );
  });

  it('trennt gemischte Steuersätze und sortiert sie aufsteigend', () => {
    const summen = berechneSummen([
      pos(1, 10000, 19, 'Arbeit'),
      pos(1, 5000, 7, 'Material'),
      pos(1, 2000, 0, 'Material'),
      pos(1, 1000, 19, 'Anfahrt'),
    ]);
    expect(summen.jeSteuersatz).toEqual([
      { mwstSatz: 0, nettoCent: 2000, mwstCent: 0 },
      { mwstSatz: 7, nettoCent: 5000, mwstCent: 350 },
      { mwstSatz: 19, nettoCent: 11000, mwstCent: 2090 },
    ]);
    expect(summen.nettoCent).toBe(18000);
    expect(summen.mwstCent).toBe(2440);
    expect(summen.bruttoCent).toBe(20440);
  });

  it('rechnet die MwSt je Steuersatz auf die Netto-Summe, nicht je Position', () => {
    // Je Position: 3 × gerundet(0,19 ct) = 0. Auf die Summe: gerundet(0,57 ct) = 1.
    const summen = berechneSummen([
      pos(1, 1, 19, 'Material'),
      pos(1, 1, 19, 'Material'),
      pos(1, 1, 19, 'Material'),
    ]);
    expect(summen.mwstCent).toBe(1);
    expect(summen.bruttoCent).toBe(4);
  });

  it('rundet jede Position einzeln auf ganze Cent', () => {
    const summen = berechneSummen([pos(0.333, 100, 19, 'Arbeit'), pos(0.333, 100, 19, 'Arbeit')]);
    expect(summen.nettoCent).toBe(66);
  });

  it('rechnet Stornopositionen mit negativen Beträgen spiegelbildlich', () => {
    const positionen = [pos(3.5, 5200, 19, 'Arbeit'), pos(12, 895, 7, 'Material')];
    const original = berechneSummen(positionen);
    const storno = berechneSummen(positionen.map((p) => ({ ...p, menge: -p.menge })));
    expect(storno.nettoCent).toBe(-original.nettoCent);
    expect(storno.mwstCent).toBe(-original.mwstCent);
    expect(storno.bruttoCent).toBe(-original.bruttoCent);
    expect(storno.jeTyp.Arbeit).toBe(-original.jeTyp.Arbeit);
  });

  it('liefert ausschließlich ganzzahlige Cent-Werte', () => {
    const summen = berechneSummen([pos(1.755, 3333, 19, 'Arbeit'), pos(0.1, 7, 7, 'Material')]);
    for (const wert of [summen.nettoCent, summen.mwstCent, summen.bruttoCent]) {
      expect(Number.isInteger(wert)).toBe(true);
    }
  });

  it('lehnt unbekannte Typen ab', () => {
    expect(() => berechneSummen([pos(1, 100, 19, 'Sonstiges' as never)])).toThrow();
  });
});
