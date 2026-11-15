import type { SqlJsStatic } from 'sql.js';
import { Datenbank, DbZugriff, SerielleDatenbank, SqlWert, SqlZeile } from './datenbank';
import { MIGRATIONEN, Migration, migriere, schemaVersion } from './migrationen';
import { SqlJsTreiber } from './sqljs-treiber';

/**
 * Datensicherung als SQLite-Datei – unabhängig davon, ob die App auf dem Gerät
 * (Capacitor) oder im Browser (sql.js) läuft: Die Daten werden tabellenweise zwischen
 * der laufenden Datenbank und einer Sicherungsdatei kopiert.
 */

async function tabellen(db: DbZugriff): Promise<string[]> {
  const zeilen = await db.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  return zeilen.map((z) => z.name);
}

/** Ersetzt den gesamten Inhalt von `ziel` durch den von `quelle` (gleiches Schema). */
async function kopiere(quelle: DbZugriff, ziel: DbZugriff): Promise<void> {
  // Die Schutz-Trigger für festgeschriebene Rechnungen würden das Ersetzen verhindern;
  // sie werden für die Dauer der Transaktion entfernt und danach wiederhergestellt.
  const trigger = await ziel.query<{ name: string; sql: string }>(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger'`,
  );
  await ziel.execute('PRAGMA defer_foreign_keys = ON');
  for (const t of trigger) {
    await ziel.run(`DROP TRIGGER "${t.name}"`);
  }
  const namen = await tabellen(ziel);
  for (const tabelle of namen) {
    await ziel.run(`DELETE FROM "${tabelle}"`);
  }
  for (const tabelle of namen) {
    for (const zeile of await quelle.query<SqlZeile>(`SELECT * FROM "${tabelle}"`)) {
      const spalten = Object.keys(zeile);
      await ziel.run(
        `INSERT INTO "${tabelle}" (${spalten.map((s) => `"${s}"`).join(', ')})
         VALUES (${spalten.map(() => '?').join(', ')})`,
        spalten.map((s) => zeile[s] as SqlWert),
      );
    }
  }
  for (const t of trigger) {
    await ziel.run(t.sql);
  }
}

/** Liefert den gesamten Datenbestand als SQLite-Datei im aktuellen Schema. */
export async function exportiereDaten(db: Datenbank, sqlJs: SqlJsStatic): Promise<Uint8Array> {
  const sicherung = new SerielleDatenbank(await SqlJsTreiber.oeffnen(sqlJs));
  try {
    await migriere(sicherung);
    // Lesen in einer Transaktion der Quelle, damit der Stand in sich stimmig ist.
    await db.transaction((quelle) => sicherung.transaction((ziel) => kopiere(quelle, ziel)));
    return await sicherung.exportieren();
  } finally {
    await sicherung.close();
  }
}

/**
 * Ersetzt den gesamten Datenbestand durch den Inhalt einer Sicherungsdatei. Ältere
 * Sicherungen werden zuerst auf das aktuelle Schema gebracht. Bei einem Fehler bleibt
 * der bisherige Bestand unverändert.
 */
export async function importiereDaten(
  db: Datenbank,
  inhalt: Uint8Array,
  sqlJs: SqlJsStatic,
  migrationen: readonly Migration[] = MIGRATIONEN,
): Promise<void> {
  let sicherung: Datenbank;
  try {
    sicherung = new SerielleDatenbank(await SqlJsTreiber.oeffnen(sqlJs, inhalt));
    const version = await schemaVersion(sicherung);
    if (version < 1 || !(await tabellen(sicherung)).includes('kunde')) {
      throw new Error('kein Datenbestand');
    }
  } catch {
    throw new Error('Die Datei ist keine Datensicherung dieser App.');
  }
  try {
    await migriere(sicherung, migrationen);
    await db.transaction((ziel) => sicherung.transaction((quelle) => kopiere(quelle, ziel)));
  } finally {
    await sicherung.close();
  }
}
