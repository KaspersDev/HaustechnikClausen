# Haustechnik Clausen – ERP

Kleines ERP für einen Haustechnik-Betrieb: Kunden, Artikel, Aufträge (Kanban),
Zeiten und Material, Rechnungen mit PDF. Läuft offline auf einem Android-Tablet
im Querformat (Angular, Ionic, Capacitor, SQLite).

Stack, Regeln und Datenmodell stehen in `CLAUDE.md`, der Umsetzungsplan in
`docs/UMSETZUNGSPLAN-V1.md`.

## Entwickeln

```bash
npm install
```

```bash
npm start
```

Die App läuft dann unter http://localhost:4200. Im Browser liegt die Datenbank in
IndexedDB; „Website-Daten löschen" setzt sie zurück.

```bash
npm run check
```

führt Lint, Unit-Tests und Build aus. Die Browser-Tests (Touch-Bedienung, kompletter
Ablauf bis zum PDF) brauchen einmalig `npx playwright install chromium` und laufen mit:

```bash
npm run e2e
```

## Auf das Tablet bringen

Voraussetzung: Android Studio mit Android SDK.

```bash
npm run android:sync
```

```bash
npx cap open android
```

In Android Studio das Tablet per USB verbinden und die App starten.

## Kurzanleitung

1. **Einstellungen:** Firmendaten, Steuernummer, Bankverbindung und Logo eintragen.
   Ohne Firmenname, Anschrift und Steuernummer/USt-IdNr. lässt sich keine Rechnung
   festschreiben.
2. **Artikel & Leistungen:** Stundensätze, Material und Anfahrtspauschalen anlegen.
   Einen Artikel vom Typ „Arbeit" als Standard-Stundensatz kennzeichnen.
3. **Kunden** anlegen (Privat oder Gewerbe).
4. **Aufträge:** „Neuer Auftrag", Kunde wählen, speichern. Im Auftrag Arbeitszeiten,
   Material und Anfahrt erfassen. Auf dem Board die Karte mit dem Finger zwischen
   Offen, In Arbeit und Erledigt ziehen.
5. **Rechnung:** Im erledigten Auftrag „Rechnung erzeugen". Der Entwurf übernimmt
   Kunde, Zeiten und Material; Positionen lassen sich noch ändern.
   „Festschreiben" vergibt die Rechnungsnummer – danach ist die Rechnung
   unveränderlich, Korrekturen gehen nur per Storno.
6. **PDF** über die Schaltfläche in der Rechnung erzeugen und teilen oder drucken.
7. **Datensicherung:** Unter Einstellungen regelmäßig „Daten exportieren" und die
   Datei außerhalb des Tablets aufbewahren. Bis zum Cloud-Sync (Version 3) ist das
   die einzige Sicherung.
