/** Prüft Aufbau und Prüfziffer einer IBAN (ISO 13616, Modulo 97). Leerzeichen sind erlaubt. */
export function istGueltigeIban(eingabe: string): boolean {
  const iban = eingabe.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    return false;
  }
  if (iban.startsWith('DE') && iban.length !== 22) {
    return false;
  }
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const zeichen of umgestellt) {
    const wert = zeichen >= 'A' ? (zeichen.charCodeAt(0) - 55).toString() : zeichen;
    for (const ziffer of wert) {
      rest = (rest * 10 + Number(ziffer)) % 97;
    }
  }
  return rest === 1;
}

/** „de89370400440532013000" → „DE89 3704 0044 0532 0130 00". */
export function formatiereIban(eingabe: string): string {
  return (
    eingabe
      .replace(/\s+/g, '')
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(' ') ?? ''
  );
}

export function istGueltigeEmail(eingabe: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eingabe.trim());
}

/** Deutsche Postleitzahlen haben fünf Ziffern; für andere Länder genügt eine Angabe. */
export function istGueltigePlz(plz: string, land: string): boolean {
  const wert = plz.trim();
  const deutsch = ['', 'deutschland', 'de', 'germany'].includes(land.trim().toLowerCase());
  return deutsch ? /^\d{5}$/.test(wert) : wert.length >= 3 && wert.length <= 10;
}

/** Deutsche USt-IdNr.: „DE" + neun Ziffern; andere EU-Länder: Länderkürzel + 2–12 Zeichen. */
export function istGueltigeUstId(eingabe: string): boolean {
  const wert = eingabe.replace(/\s+/g, '').toUpperCase();
  return wert.startsWith('DE') ? /^DE\d{9}$/.test(wert) : /^[A-Z]{2}[A-Z0-9+*]{2,12}$/.test(wert);
}
