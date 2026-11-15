import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { DATENBANK } from './app/core/db/datenbank';
import { oeffneDatenbank } from './app/core/db/datenbank-fabrik';

async function starten(): Promise<void> {
  const datenbank = await oeffneDatenbank();
  await bootstrapApplication(App, {
    ...appConfig,
    providers: [...appConfig.providers, { provide: DATENBANK, useValue: datenbank }],
  });
}

starten().catch((fehler: unknown) => {
  console.error(fehler);
  const meldung = document.createElement('p');
  meldung.style.padding = '24px';
  meldung.textContent = `Die App konnte nicht gestartet werden: ${String(fehler)}`;
  document.body.replaceChildren(meldung);
});
