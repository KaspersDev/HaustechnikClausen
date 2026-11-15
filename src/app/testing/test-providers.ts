import { EnvironmentProviders, Provider } from '@angular/core';
import { Routes, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { DATENBANK } from '../core/db/datenbank';
import { REPO_KONTEXT, provideRepositories } from '../core/repositories/provide-repositories';
import { RepoKontext } from '../core/repositories/sqlite/kontext';
import { UHR } from '../core/services/uhr';

/** Provider für Komponententests: echte Repositories auf der Test-Datenbank, feste Uhr. */
export function provideTestUmgebung(
  kontext: RepoKontext,
  routen: Routes = [],
): (Provider | EnvironmentProviders)[] {
  return [
    provideIonicAngular({ mode: 'md', animated: false }),
    provideRouter(routen),
    { provide: DATENBANK, useValue: kontext.db },
    ...provideRepositories(),
    { provide: REPO_KONTEXT, useValue: kontext },
    { provide: UHR, useValue: { jetzt: () => new Date(kontext.jetzt()) } },
  ];
}
