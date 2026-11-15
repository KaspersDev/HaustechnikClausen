/**
 * Zerlegt ein SQL-Skript in einzelne Anweisungen. Berücksichtigt Zeichenketten,
 * Zeilenkommentare und Trigger-Rümpfe (BEGIN … END), die selbst Semikolons enthalten.
 */
export function zerlegeSql(skript: string): string[] {
  const anweisungen: string[] = [];
  let aktuell = '';
  let inTrigger = false;
  let i = 0;

  const abschliessen = (): void => {
    const text = aktuell.trim();
    if (text !== '') {
      anweisungen.push(text);
    }
    aktuell = '';
    inTrigger = false;
  };

  while (i < skript.length) {
    const zeichen = skript[i];

    if (zeichen === '-' && skript[i + 1] === '-') {
      const ende = skript.indexOf('\n', i);
      i = ende === -1 ? skript.length : ende;
      continue;
    }

    if (zeichen === "'") {
      let j = i + 1;
      while (j < skript.length) {
        if (skript[j] === "'" && skript[j + 1] === "'") {
          j += 2;
        } else if (skript[j] === "'") {
          break;
        } else {
          j++;
        }
      }
      aktuell += skript.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (zeichen === ';') {
      if (!inTrigger) {
        abschliessen();
      } else if (/\bEND\s*$/i.test(aktuell)) {
        abschliessen();
      } else {
        aktuell += zeichen;
      }
      i++;
      continue;
    }

    aktuell += zeichen;
    if (!inTrigger && /^\s*CREATE\s+(TEMP(ORARY)?\s+)?TRIGGER\b/i.test(aktuell)) {
      inTrigger = true;
    }
    i++;
  }
  abschliessen();
  return anweisungen;
}
