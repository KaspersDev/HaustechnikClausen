import { EnvironmentProviders, Provider } from '@angular/core';
import { Routes, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { DATENBANK } from '../core/db/datenbank';
import { REPO_KONTEXT, provideRepositories } from '../core/repositories/provide-repositories';
import { RepoKontext } from '../core/repositories/sqlite/kontext';
import { UHR } from '../core/services/uhr';
import { Bestaetigung } from '../shared/bestaetigung';
import { Meldung } from '../shared/meldung';

/** Zeichnet Meldungen und Rückfragen auf, statt Overlays zu öffnen. */
export class TestDialoge {
  /** Antwort auf die nächste Sicherheitsabfrage. */
  antwort = true;
  readonly fragen: string[] = [];
  readonly erfolge: string[] = [];
  readonly fehler: string[] = [];

  readonly bestaetigung = {
    frage: async (titel: string): Promise<boolean> => {
      this.fragen.push(titel);
      return this.antwort;
    },
  };
  readonly meldung = {
    erfolg: async (text: string): Promise<void> => void this.erfolge.push(text),
    fehler: async (text: string): Promise<void> => void this.fehler.push(text),
  };
}

/** Provider für Komponententests: echte Repositories auf der Test-Datenbank, feste Uhr. */
export function provideTestUmgebung(
  kontext: RepoKontext,
  routen: Routes = [],
  dialoge = new TestDialoge(),
): (Provider | EnvironmentProviders)[] {
  return [
    provideIonicAngular({ mode: 'md', animated: false }),
    provideRouter(routen),
    { provide: DATENBANK, useValue: kontext.db },
    ...provideRepositories(),
    { provide: REPO_KONTEXT, useValue: kontext },
    { provide: TestDialoge, useValue: dialoge },
    { provide: Bestaetigung, useValue: dialoge.bestaetigung },
    { provide: Meldung, useValue: dialoge.meldung },
    { provide: UHR, useValue: { jetzt: () => new Date(kontext.jetzt()) } },
  ];
}
