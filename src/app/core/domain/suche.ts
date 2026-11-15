/** Kleinschreibung, Umlaute und Akzente vereinheitlicht („Müller" → „muller", „ß" → „ss"). */
export function normalisiere(text: string): string {
  return text.toLocaleLowerCase('de').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Wahr, wenn jeder Suchbegriff in mindestens einem der Felder als Teiltext vorkommt.
 * Eine leere Suche trifft alles.
 */
export function passtZurSuche(suche: string, felder: readonly string[]): boolean {
  const begriffe = normalisiere(suche).split(/\s+/).filter(Boolean);
  const heuhaufen = felder.map(normalisiere);
  return begriffe.every((begriff) => heuhaufen.some((feld) => feld.includes(begriff)));
}
