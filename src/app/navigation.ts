export interface NavEintrag {
  readonly pfad: string;
  readonly titel: string;
  readonly icon: string;
}

/** Hauptbereiche der App in der Reihenfolge der Seitennavigation. */
export const NAVIGATION: readonly NavEintrag[] = [
  { pfad: '/auftraege', titel: 'Aufträge', icon: 'clipboard-outline' },
  { pfad: '/kunden', titel: 'Kunden', icon: 'people-outline' },
  { pfad: '/artikel', titel: 'Artikel & Leistungen', icon: 'pricetags-outline' },
  { pfad: '/rechnungen', titel: 'Rechnungen', icon: 'document-text-outline' },
  { pfad: '/einstellungen', titel: 'Einstellungen', icon: 'settings-outline' },
];
