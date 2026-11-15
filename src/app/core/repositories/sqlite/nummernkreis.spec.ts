import { testDatenbank } from '../../../testing/test-datenbank';
import { Datenbank } from '../../db/datenbank';
import { formatiereNummer } from '../../domain/nummern';
import { vergibNummer } from './nummernvergabe';
import { SqliteNummernkreisRepository } from './sqlite-nummernkreis.repository';

describe('formatiereNummer', () => {
  it('füllt auf vier Stellen auf und wächst darüber hinaus', () => {
    expect(formatiereNummer('RE', 2026, 1)).toBe('RE-2026-0001');
    expect(formatiereNummer('AU', 2026, 432)).toBe('AU-2026-0432');
    expect(formatiereNummer('RE', 2026, 12345)).toBe('RE-2026-12345');
  });

  it('lehnt ungültige Nummern ab', () => {
    expect(() => formatiereNummer('RE', 2026, 0)).toThrow();
    expect(() => formatiereNummer('RE', 2026, 1.5)).toThrow();
  });
});

describe('Nummernkreise', () => {
  let db: Datenbank;
  let repo: SqliteNummernkreisRepository;

  const vergib = (typ: Parameters<typeof vergibNummer>[1], jahr = 2026): Promise<string> =>
    db.transaction((tx) => vergibNummer(tx, typ, jahr));

  beforeEach(async () => {
    db = await testDatenbank();
    repo = new SqliteNummernkreisRepository(db);
  });

  afterEach(() => db.close());

  it('beginnt bei 1 und zählt fortlaufend', async () => {
    expect(await vergib('Rechnung')).toBe('RE-2026-0001');
    expect(await vergib('Rechnung')).toBe('RE-2026-0002');
    expect(await vergib('Rechnung')).toBe('RE-2026-0003');
  });

  it('bleibt über viele Vergaben lückenlos und eindeutig', async () => {
    const nummern: string[] = [];
    for (let i = 0; i < 150; i++) {
      nummern.push(await vergib('Auftrag'));
    }
    expect(nummern).toEqual(
      Array.from({ length: 150 }, (_, i) => formatiereNummer('AU', 2026, i + 1)),
    );
  });

  it('bleibt auch bei gleichzeitig angestoßenen Vergaben lückenlos', async () => {
    const nummern = await Promise.all(Array.from({ length: 20 }, () => vergib('Rechnung')));
    expect(new Set(nummern).size).toBe(20);
    expect([...nummern].sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => formatiereNummer('RE', 2026, i + 1)),
    );
  });

  it('verbraucht keine Nummer, wenn die Transaktion zurückgerollt wird', async () => {
    expect(await vergib('Rechnung')).toBe('RE-2026-0001');
    await expect(
      db.transaction(async (tx) => {
        await vergibNummer(tx, 'Rechnung', 2026);
        throw new Error('Speichern fehlgeschlagen');
      }),
    ).rejects.toThrow();
    expect(await vergib('Rechnung')).toBe('RE-2026-0002');
  });

  it('führt getrennte Kreise je Typ', async () => {
    expect(await vergib('Rechnung')).toBe('RE-2026-0001');
    expect(await vergib('Auftrag')).toBe('AU-2026-0001');
    expect(await vergib('Angebot')).toBe('AN-2026-0001');
    expect(await vergib('Rechnung')).toBe('RE-2026-0002');
  });

  it('beginnt in jedem Jahr neu', async () => {
    expect(await vergib('Rechnung', 2026)).toBe('RE-2026-0001');
    expect(await vergib('Rechnung', 2026)).toBe('RE-2026-0002');
    expect(await vergib('Rechnung', 2027)).toBe('RE-2027-0001');
    expect(await vergib('Rechnung', 2026)).toBe('RE-2026-0003');
  });

  it('verwendet einen eingestellten Startwert', async () => {
    await repo.setzeStartwert('Rechnung', 2026, 87);
    expect(await repo.stand('Rechnung', 2026)).toEqual({
      typ: 'Rechnung',
      jahr: 2026,
      naechsteNummer: 87,
      bereitsVergeben: false,
    });
    expect(await vergib('Rechnung')).toBe('RE-2026-0087');
    expect(await vergib('Rechnung')).toBe('RE-2026-0088');
  });

  it('lässt den Startwert ändern, solange nichts vergeben wurde', async () => {
    await repo.setzeStartwert('Rechnung', 2026, 87);
    await repo.setzeStartwert('Rechnung', 2026, 5);
    expect(await vergib('Rechnung')).toBe('RE-2026-0005');
  });

  it('sperrt den Startwert nach der ersten Vergabe', async () => {
    await vergib('Rechnung');
    await expect(repo.setzeStartwert('Rechnung', 2026, 50)).rejects.toThrow(/bereits Nummern/);
    expect((await repo.stand('Rechnung', 2026)).bereitsVergeben).toBe(true);
    expect(await vergib('Rechnung')).toBe('RE-2026-0002');
  });

  it('lehnt ungültige Startwerte ab', async () => {
    await expect(repo.setzeStartwert('Rechnung', 2026, 0)).rejects.toThrow();
    await expect(repo.setzeStartwert('Rechnung', 2026, 2.5)).rejects.toThrow();
  });

  it('meldet für einen unbenutzten Kreis die 1 als nächste Nummer', async () => {
    expect((await repo.stand('Angebot', 2030)).naechsteNummer).toBe(1);
  });
});
