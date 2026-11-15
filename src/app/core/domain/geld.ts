/**
 * Geldbeträge sind immer ganze Cent (Integer). Diese Datei enthält die einzige
 * Stelle, an der gerundet, formatiert und geparst wird.
 */

/** Ganzzahlige Division mit kaufmännischer Rundung (0,5 wird vom Nullpunkt weg gerundet). */
export function teileGerundet(zaehler: number, nenner: number): number {
  if (!Number.isSafeInteger(zaehler) || !Number.isSafeInteger(nenner) || nenner <= 0) {
    throw new Error(`Ungültige Division: ${zaehler} / ${nenner}`);
  }
  const vorzeichen = zaehler < 0 ? -1 : 1;
  const betrag = Math.abs(zaehler);
  const ganz = Math.floor(betrag / nenner);
  const rest = betrag % nenner;
  const ergebnis = rest * 2 >= nenner ? ganz + 1 : ganz;
  return ergebnis === 0 ? 0 : vorzeichen * ergebnis;
}

/** Menge (höchstens drei Nachkommastellen) als ganze Tausendstel. */
export function mengeInTausendstel(menge: number): number {
  if (!Number.isFinite(menge)) {
    throw new Error(`Ungültige Menge: ${menge}`);
  }
  return Math.round(menge * 1000);
}

/** Positionsbetrag in Cent = kaufmännisch gerundet(menge × einzelpreisCent). */
export function positionsbetragCent(menge: number, einzelpreisCent: number): number {
  pruefeCent(einzelpreisCent);
  return teileGerundet(mengeInTausendstel(menge) * einzelpreisCent, 1000);
}

/** MwSt in Cent auf einen Nettobetrag; der Satz ist ein ganzzahliger Prozentwert. */
export function mwstCent(nettoCent: number, mwstSatz: number): number {
  pruefeCent(nettoCent);
  if (!Number.isInteger(mwstSatz) || mwstSatz < 0 || mwstSatz > 100) {
    throw new Error(`Ungültiger MwSt-Satz: ${mwstSatz}`);
  }
  return teileGerundet(nettoCent * mwstSatz, 100);
}

export function pruefeCent(cent: number): void {
  if (!Number.isSafeInteger(cent)) {
    throw new Error(`Geldbetrag ist kein ganzzahliger Cent-Wert: ${cent}`);
  }
}

/** 123456 → „1.234,56" (ohne Währungszeichen). */
export function formatiereBetrag(cent: number): string {
  pruefeCent(cent);
  const betrag = Math.abs(cent);
  const euro = Math.floor(betrag / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = (betrag % 100).toString().padStart(2, '0');
  return `${cent < 0 ? '-' : ''}${euro},${rest}`;
}

/** 123456 → „1.234,56 €". */
export function formatiereEuro(cent: number): string {
  return `${formatiereBetrag(cent)} €`;
}

/**
 * Liest eine Euro-Eingabe („12,50", „1.234,56 €", „12.5", „-3") und liefert Cent.
 * Ungültige Eingaben und mehr als zwei Nachkommastellen ergeben `null`.
 */
export function parseEuro(eingabe: string): number | null {
  let text = eingabe.replace(/[\s€]/g, '');
  if (text === '') {
    return null;
  }
  let vorzeichen = 1;
  if (text.startsWith('-')) {
    vorzeichen = -1;
    text = text.slice(1);
  }
  if (text.includes(',')) {
    // Deutsches Format: Punkte sind Tausendertrennzeichen.
    const [vorKomma, ...restTeile] = text.split(',');
    if (restTeile.length !== 1 || !/^(\d+|\d{1,3}(\.\d{3})+)$/.test(vorKomma)) {
      return null;
    }
    text = `${vorKomma.replace(/\./g, '')}.${restTeile[0]}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  const treffer = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!treffer) {
    return null;
  }
  const cent = Number(treffer[1]) * 100 + Number((treffer[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cent)) {
    return null;
  }
  return cent === 0 ? 0 : vorzeichen * cent;
}
