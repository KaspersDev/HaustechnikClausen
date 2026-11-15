/** Kalendertag „JJJJ-MM-TT" eines Zeitpunkts in Ortszeit. */
export function tagVon(zeitpunkt: Date): string {
  const jahr = zeitpunkt.getFullYear();
  const monat = (zeitpunkt.getMonth() + 1).toString().padStart(2, '0');
  const tag = zeitpunkt.getDate().toString().padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
}

/** „2026-03-10" (oder ISO-Zeitpunkt) → „10.03.2026" in Ortszeit. Leer bei `null`. */
export function formatiereDatum(wert: string | null | undefined): string {
  if (!wert) {
    return '';
  }
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(wert) ? wert : tagVon(new Date(wert));
  const [jahr, monat, t] = tag.split('-');
  return `${t}.${monat}.${jahr}`;
}

/** „JJJJ-MM-TT" plus eine Anzahl Tage. */
export function plusTage(tag: string, tage: number): string {
  const [jahr, monat, t] = tag.split('-').map(Number);
  return tagVon(new Date(jahr, monat - 1, t + tage));
}

/** ISO-Zeitpunkt → „HH:MM" in Ortszeit. */
export function formatiereUhrzeit(zeitpunkt: string): string {
  const d = new Date(zeitpunkt);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** Tag („JJJJ-MM-TT") und Uhrzeit („HH:MM") in Ortszeit → ISO-Zeitpunkt in UTC. */
export function zeitpunktAus(tag: string, uhrzeit: string): string {
  const [jahr, monat, t] = tag.split('-').map(Number);
  const [stunde, minute] = uhrzeit.split(':').map(Number);
  return new Date(jahr, monat - 1, t, stunde, minute).toISOString();
}
