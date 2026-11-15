import { Datenbank } from '../../db/datenbank';
import { NummernkreisTyp } from '../../domain/nummern';
import { NummernkreisRepository, NummernkreisStand } from '../nummernkreis.repository';

export class SqliteNummernkreisRepository implements NummernkreisRepository {
  constructor(private readonly db: Datenbank) {}

  async stand(typ: NummernkreisTyp, jahr: number): Promise<NummernkreisStand> {
    const [zeile] = await this.db.query<{ startwert: number; naechste_nummer: number }>(
      'SELECT startwert, naechste_nummer FROM nummernkreis WHERE typ = ? AND jahr = ?',
      [typ, jahr],
    );
    return {
      typ,
      jahr,
      naechsteNummer: zeile?.naechste_nummer ?? 1,
      bereitsVergeben: zeile !== undefined && zeile.naechste_nummer > zeile.startwert,
    };
  }

  async setzeStartwert(typ: NummernkreisTyp, jahr: number, startwert: number): Promise<void> {
    if (!Number.isInteger(startwert) || startwert < 1) {
      throw new Error('Der Startwert muss eine ganze Zahl ab 1 sein.');
    }
    await this.db.transaction(async (tx) => {
      const [zeile] = await tx.query<{ startwert: number; naechste_nummer: number }>(
        'SELECT startwert, naechste_nummer FROM nummernkreis WHERE typ = ? AND jahr = ?',
        [typ, jahr],
      );
      if (zeile && zeile.naechste_nummer > zeile.startwert) {
        throw new Error(
          `Im Nummernkreis ${typ} ${jahr} wurden bereits Nummern vergeben; der Startwert ist fest.`,
        );
      }
      await tx.run(
        `INSERT INTO nummernkreis (typ, jahr, startwert, naechste_nummer) VALUES (?, ?, ?, ?)
         ON CONFLICT (typ, jahr) DO UPDATE SET
           naechste_nummer = excluded.naechste_nummer, startwert = excluded.startwert`,
        [typ, jahr, startwert, startwert],
      );
    });
  }
}
