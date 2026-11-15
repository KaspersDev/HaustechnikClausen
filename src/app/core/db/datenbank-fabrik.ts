import { Capacitor } from '@capacitor/core';
import { CapacitorTreiber } from './capacitor-treiber';
import { Datenbank, SerielleDatenbank } from './datenbank';
import { migriere } from './migrationen';
import { SqlJsTreiber } from './sqljs-treiber';

export const DB_DATEINAME = 'haustechnik';

/** Öffnet die Datenbank der laufenden Plattform und bringt das Schema auf Stand. */
export async function oeffneDatenbank(): Promise<Datenbank> {
  const db = Capacitor.isNativePlatform() ? await oeffneAufGeraet() : await oeffneImBrowser();
  await migriere(db);
  return db;
}

async function oeffneAufGeraet(): Promise<Datenbank> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency();
  const vorhanden = (await sqlite.isConnection(DB_DATEINAME, false)).result;
  const verbindung = vorhanden
    ? await sqlite.retrieveConnection(DB_DATEINAME, false)
    : await sqlite.createConnection(DB_DATEINAME, false, 'no-encryption', 1, false);
  await verbindung.open();
  await verbindung.run('PRAGMA foreign_keys = ON', [], false);

  const treiber = new CapacitorTreiber(verbindung, async () => {
    // Die Datensicherung kopiert die Daten tabellenweise (siehe datensicherung.ts).
    throw new Error('Auf dem Gerät wird die Datenbankdatei nicht direkt gelesen.');
  });
  return new SerielleDatenbank(treiber);
}

async function oeffneImBrowser(): Promise<Datenbank> {
  const [{ default: initSqlJs }, speicher] = await Promise.all([
    import('sql.js'),
    import('./browser-speicher'),
  ]);
  const sql = await initSqlJs({ locateFile: (datei) => `sqljs/${datei}` });
  const treiber = await SqlJsTreiber.oeffnen(sql, await speicher.ladeAusBrowser());

  let geplant: ReturnType<typeof setTimeout> | null = null;
  treiber.nachAenderung = () => {
    if (geplant === null) {
      geplant = setTimeout(() => {
        geplant = null;
        void treiber.exportieren().then((inhalt) => speicher.speichereImBrowser(inhalt));
      }, 250);
    }
  };
  return new SerielleDatenbank(treiber);
}
