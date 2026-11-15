# Haustechnik Clausen – ERP

Kleines ERP für einen Haustechnik-Betrieb (Handwerk für Privat- und Gewerbekunden).
Zielgerät: Android-Tablet im Querformat, Einsatz unterwegs beim Kunden, offline first.

Kernidee: **Der Auftrag steht im Mittelpunkt.**
Ablauf: Anfrage → Angebot → Auftrag → Durchführung → Rechnung → Bezahlt

Umsetzungsplan Version 1: `docs/UMSETZUNGSPLAN-V1.md`

## Arbeitsweise

- Es wird in kleinen Schritten nach Plan gearbeitet. Kein Schritt ohne Tests.
- Ein Schritt ist fertig, wenn Tests, Lint und Build grün sind.
- Abweichungen vom Datenmodell oder von den Regeln erst abstimmen, dann umsetzen.
- Sprache: Fachbegriffe, Bezeichner des Datenmodells und UI-Texte auf Deutsch
  (ohne Umlaute in Bezeichnern: `gueltigBis`, `faelligAm`). Technische Begriffe
  (Repository, Service, Component) bleiben englisch.

## Tech-Stack

- Angular (Standalone Components, Signals), TypeScript `strict`
- Ionic (UI-Komponenten), Capacitor (Android)
- SQLite über `@capacitor-community/sqlite`; im Browser (Entwicklung) und in Tests
  dieselbe SQLite über `sql.js` (WebAssembly, im Browser in IndexedDB abgelegt)
- Angular CDK Drag & Drop für das Kanban-Board
- PDF-Erzeugung vollständig offline auf dem Gerät (pdfmake), Ablage/Teilen über
  Capacitor Filesystem + Share
- Tests: Unit-/Integrationstests mit Vitest über die Angular CLI;
  Repository-Tests laufen gegen eine echte In-Memory-SQLite

Konkrete Versionen werden beim Scaffolding festgelegt (jeweils aktuelle stabile Version).

## Architektur

```
src/app/
  core/
    db/            DB-Adapter, Migrationen, Transaktionen
    domain/        Entitäten, Enums, reine Fachlogik (Geld, MwSt, Summen, Nummern)
    repositories/  Interface je Aggregat + SQLite-Implementierung
    services/      Anwendungsfälle (z. B. RechnungAusAuftragService, PdfService)
  features/
    kunden/  artikel/  auftraege/  rechnungen/  einstellungen/
  shared/          UI-Bausteine, Pipes (Geld, Datum), Validatoren
```

- **Repository-Pattern:** Features und Services kennen nur Repository-Interfaces
  (per Injection Token), nie SQL. Die SQLite-Implementierung ist austauschbar bzw.
  später um einen Sync-Layer erweiterbar.
- **Fachlogik ist rein** (keine Angular-/DB-Abhängigkeit) und liegt in `core/domain`.
  Dort wird am dichtesten getestet.
- **DB-Adapter:** dünne Schnittstelle (`run`, `query`, `transaction`) über dem
  SQLite-Plugin, damit Tests ohne Gerät laufen.
- **Migrationen:** nummeriert, nur vorwärts, Stand in `PRAGMA user_version`.
  Ausgelieferte Migrationen werden nie nachträglich geändert.
- **Sync-Vorbereitung:** IDs sind UUIDs (Text). Jede Tabelle hat `erstelltAm`,
  `geaendertAm` und `geloeschtAm` (Soft Delete). Kein Hard Delete fachlicher Daten.

## Regeln (verbindlich)

1. **Geld in Cent als Integer.** Nie Fließkomma für Beträge. Felder heißen `…Cent`
   (`nettopreisCent`, `einzelpreisCent`, `summeNettoCent` …). Formatierung nur in der UI.
2. **MwSt-Satz** als ganzzahliger Prozentwert (`19`, `7`, `0`).
3. **Rundung:** Positionsbetrag = kaufmännisch gerundet(`menge × einzelpreisCent`).
   MwSt wird je Steuersatz auf die Netto-Summe gerechnet, nicht je Position.
4. **Versendete Rechnungen sind unveränderlich.** Änderbar ist nur der Status
   (Versendet → Bezahlt / Storniert). Korrektur nur per Storno. Durchgesetzt im
   Repository **und** per SQLite-Trigger.
5. **Nummern fortlaufend und lückenlos** (Rechnung, Angebot, Auftrag). Vergabe über
   Nummernkreis-Tabelle in derselben Transaktion wie das Speichern.
   Rechnungen erhalten ihre Nummer erst beim Festschreiben (Entwurf → Versendet);
   Entwürfe haben keine Nummer und dürfen gelöscht werden. Nummerierte Datensätze
   werden nie gelöscht.
6. **Rechnung als Momentaufnahme:** Beim Festschreiben werden Empfängeradresse,
   Positionen, Preise und Steuersätze in die Rechnung kopiert. Spätere Änderungen an
   Kunde oder Artikel verändern keine bestehende Rechnung.
7. **§ 35a EStG:** Auf Rechnungen werden Arbeit, Material und Anfahrt getrennt
   ausgewiesen (Zwischensummen je Typ).
8. **Privatkunden:** Rechnung enthält automatisch den Hinweis auf die zweijährige
   Aufbewahrungspflicht (§ 14b Abs. 1 Satz 5 UStG).
9. **Zeiten** als ISO-8601-Strings (UTC) speichern, in der UI in Ortszeit anzeigen.
10. **UI:** Touch und Tablet-Querformat. Bedienelemente mindestens 48 × 48 dp,
    großzügige Abstände, keine Hover-Abhängigkeiten, Split-Layouts (Liste + Detail).

## Datenmodell

Alle Entitäten zusätzlich mit `geaendertAm`, `geloeschtAm` (siehe Sync-Vorbereitung).
Mit ⊕ markierte Felder sind Ergänzungen gegenüber der ursprünglichen Vorgabe
(Begründung im Umsetzungsplan, Abschnitt „Offene Punkte").

| Entität | Felder |
|---|---|
| **Kunde** | id, typ (Privat/Gewerbe), firma, name, strasse, plz, ort, land, email, telefon, ustId, erstelltAm |
| **Artikel** | id, bezeichnung, einheit, nettopreisCent, mwstSatz, typ (Arbeit/Material/Anfahrt) |
| **Auftrag** | id, nummer, kundeId, titel, beschreibung, einsatzort (strasse, plz, ort, land – kann von Rechnungsadresse abweichen), status (Offen/InArbeit/Erledigt/Abgerechnet), geplantAm, erledigtAm, rechnungId, sortierung ⊕ |
| **Zeiteintrag** | id, auftragId, start, ende, pauseMinuten, taetigkeit |
| **Materialeintrag** | id, auftragId, artikelId, menge, einzelpreisCent |
| **Foto** (V2) | id, auftragId, pfad, typ (Vorher/Nachher), aufgenommenAm |
| **Angebot** (V2) | id, nummer, kundeId, datum, gueltigBis, status (Entwurf/Versendet/Angenommen/Abgelehnt), auftragId |
| **Angebotsposition** (V2) | wie Rechnungsposition, mit angebotId |
| **Rechnung** | id, nummer (leer im Entwurf), kundeId, auftragId, datum, faelligAm, leistungsdatum ⊕, status (Entwurf/Versendet/Bezahlt/Storniert), summeNettoCent, summeMwstCent, summeBruttoCent, empfaenger-Snapshot ⊕ (typ, firma, name, strasse, plz, ort, land, ustId), stornoVonRechnungId ⊕ |
| **Rechnungsposition** | id, rechnungId, artikelId, beschreibung, menge, einheit ⊕, einzelpreisCent, mwstSatz, typ (Arbeit/Material/Anfahrt), position ⊕ (Reihenfolge) |
| **Firmendaten** | name, adresse, steuernummer, ustId, bankverbindung (Inhaber, IBAN, BIC, Bank), logo, telefon ⊕, email ⊕ |
| **Einstellungen** ⊕ | zahlungszielTage, standardStundensatzArtikelId, Nummernformate |
| **Nummernkreis** ⊕ | typ (Rechnung/Angebot/Auftrag), jahr, naechsteNummer |

### Statusübergänge

- **Auftrag:** Offen ↔ InArbeit ↔ Erledigt frei per Drag & Drop. `Erledigt` setzt
  `erledigtAm`. `Abgerechnet` wird ausschließlich durch das Festschreiben einer
  Rechnung gesetzt, nie per Drag & Drop; abgerechnete Aufträge sind fixiert.
- **Rechnung:** Entwurf → Versendet → Bezahlt; Versendet/Bezahlt → Storniert.
  Kein Weg zurück in den Entwurf.

## Versionen

- **V1:** Kunden, Artikel/Leistungen, Auftrags-Kanban, Rechnung aus Auftrag,
  PDF-Export, Firmendaten/Einstellungen
- **V2:** Zeiterfassung Start/Stopp, Materialerfassung, Fotos, Angebote → Auftrag
- **V3:** Kundenunterschrift, Kalender, Zahlungsstatus/Mahnwesen, Cloud-Sync/Backup
  (bis dahin Export-Funktion), E-Rechnung (ZUGFeRD/XRechnung)

## Befehle

- `npm start` – Dev-Server im Browser (http://localhost:4200)
- `npm test` – alle Tests einmal ausführen (`npm run test:watch` für Watch-Modus)
- `npm run lint` – ESLint
- `npm run build` – Produktions-Build nach `dist/haustechnik-clausen/browser`
- `npm run check` – Lint + Tests + Build; muss vor jedem Commit grün sein
- `npm run e2e` – Browser-Tests (Playwright, Touch-Eingabe) gegen die laufende App;
  einmalig vorher `npx playwright install chromium`
- `npm run android:sync` – Build und Übertragung in das Android-Projekt (`android/`);
  danach in Android Studio öffnen (`npx cap open android`) oder mit Gradle bauen

Hinweise zum Stack: Ionic 9 exportiert die Standalone-Komponenten direkt aus
`@ionic/angular`. Die App läuft zoneless; Zustand in Komponenten über Signals.
Tests laufen mit Vitest in jsdom (`src/test-setup.ts` stellt fehlende Browser-APIs bereit).
