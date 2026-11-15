import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'auftraege' },
  {
    path: 'auftraege',
    loadComponent: () => import('./features/auftraege/auftraege.page').then((m) => m.AuftraegePage),
  },
  {
    path: 'auftraege/neu',
    loadComponent: () =>
      import('./features/auftraege/auftrag-detail.page').then((m) => m.AuftragDetailPage),
  },
  {
    path: 'auftraege/:id',
    loadComponent: () =>
      import('./features/auftraege/auftrag-detail.page').then((m) => m.AuftragDetailPage),
  },
  {
    path: 'kunden',
    loadComponent: () => import('./features/kunden/kunden.page').then((m) => m.KundenPage),
  },
  {
    path: 'artikel',
    loadComponent: () => import('./features/artikel/artikel.page').then((m) => m.ArtikelPage),
  },
  {
    path: 'rechnungen',
    loadComponent: () =>
      import('./features/rechnungen/rechnungen.page').then((m) => m.RechnungenPage),
  },
  {
    path: 'einstellungen',
    loadComponent: () =>
      import('./features/einstellungen/einstellungen.page').then((m) => m.EinstellungenPage),
  },
];
