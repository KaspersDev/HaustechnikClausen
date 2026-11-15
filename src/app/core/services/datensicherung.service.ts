import { Injectable, InjectionToken, inject } from '@angular/core';
import type { SqlJsStatic } from 'sql.js';
import { DATENBANK } from '../db/datenbank';
import { exportiereDaten, importiereDaten } from '../db/datensicherung';
import { tagVon } from '../domain/datum';
import { DATEIAUSGABE } from './pdf.service';
import { UHR } from './uhr';

/** Lädt sql.js (WebAssembly); wird für das Lesen und Schreiben der Sicherungsdatei gebraucht. */
export const SQLJS_LADER = new InjectionToken<() => Promise<SqlJsStatic>>('SQLJS_LADER', {
  providedIn: 'root',
  factory: () => async () => {
    const { default: initSqlJs } = await import('sql.js');
    return initSqlJs({ locateFile: (datei) => `sqljs/${datei}` });
  },
});

function alsBase64(bytes: Uint8Array): string {
  let binaer = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binaer);
}

/** Export und Wiederherstellung des gesamten Datenbestands (Überbrückung bis zum Cloud-Sync). */
@Injectable({ providedIn: 'root' })
export class DatensicherungService {
  private readonly db = inject(DATENBANK);
  private readonly ladeSqlJs = inject(SQLJS_LADER);
  private readonly ausgabe = inject(DATEIAUSGABE);
  private readonly uhr = inject(UHR);

  /** Übergibt die Sicherungsdatei an Teilen-Dialog bzw. Download und liefert ihren Namen. */
  async exportieren(): Promise<string> {
    const inhalt = await exportiereDaten(this.db, await this.ladeSqlJs());
    const dateiname = `haustechnik-sicherung-${tagVon(this.uhr.jetzt())}.sqlite`;
    await this.ausgabe.ausgeben(
      { dateiname, base64: alsBase64(inhalt) },
      'application/vnd.sqlite3',
    );
    return dateiname;
  }

  /** Ersetzt alle Daten durch den Inhalt der Sicherungsdatei. */
  async wiederherstellen(datei: Blob): Promise<void> {
    const inhalt = new Uint8Array(await datei.arrayBuffer());
    await importiereDaten(this.db, inhalt, await this.ladeSqlJs());
  }
}
