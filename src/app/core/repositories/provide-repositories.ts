import { InjectionToken, Provider, inject } from '@angular/core';
import { DATENBANK } from '../db/datenbank';
import { EINSTELLUNGEN_REPOSITORY, FIRMENDATEN_REPOSITORY } from './firma.repository';
import { NUMMERNKREIS_REPOSITORY } from './nummernkreis.repository';
import { RepoKontext, standardKontext } from './sqlite/kontext';
import {
  SqliteEinstellungenRepository,
  SqliteFirmendatenRepository,
} from './sqlite/sqlite-firma.repository';
import { SqliteNummernkreisRepository } from './sqlite/sqlite-nummernkreis.repository';

export const REPO_KONTEXT = new InjectionToken<RepoKontext>('REPO_KONTEXT');

/**
 * Bindet die Repository-Interfaces an ihre SQLite-Implementierungen. Features kennen
 * nur die Tokens; ein späterer Sync-Layer ersetzt oder umhüllt die Implementierungen hier.
 */
export function provideRepositories(): Provider[] {
  return [
    { provide: REPO_KONTEXT, useFactory: () => standardKontext(inject(DATENBANK)) },
    {
      provide: FIRMENDATEN_REPOSITORY,
      useFactory: () => new SqliteFirmendatenRepository(inject(REPO_KONTEXT)),
    },
    {
      provide: EINSTELLUNGEN_REPOSITORY,
      useFactory: () => new SqliteEinstellungenRepository(inject(REPO_KONTEXT)),
    },
    {
      provide: NUMMERNKREIS_REPOSITORY,
      useFactory: () => new SqliteNummernkreisRepository(inject(REPO_KONTEXT).db),
    },
  ];
}
