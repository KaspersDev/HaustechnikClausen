# Umsetzungsplan Version 1

Status: **Freigegeben und umgesetzt (Schritte 1–14).** Die offenen Punkte wurden wie
vorgeschlagen umgesetzt. Abweichungen vom Plan:

- Im Browser und in Tests läuft SQLite über `sql.js` statt `jeep-sqlite`.
- Das Logo liegt als Data-URL in der Datenbank statt als Datei im App-Verzeichnis;
  dadurch ist es in der Datensicherung enthalten.
- PDFs werden nicht dauerhaft abgelegt, sondern bei Bedarf neu erzeugt (die
  festgeschriebene Rechnung ist unveränderlich, das PDF also immer gleich). Eine
  Vorschau in der App gibt es nicht; das PDF öffnet sich über den Teilen-Dialog.
- Zeiten über Mitternacht lassen sich im Formular nicht erfassen (ein Datum, Von/Bis);
  die Fachlogik kann es bereits, die Start/Stopp-Erfassung in V2 nutzt das.
- Noch offen: Android-Build und Test auf dem Tablet (in der Entwicklungsumgebung
  gibt es kein Android SDK).

Umfang V1: Kundenverwaltung, Artikel und Leistungen, Auftrags-Kanban,
„Rechnung aus Auftrag erzeugen", PDF-Export, Firmendaten und Einstellungen.

Jeder Schritt ist ein eigener Commit (bzw. wenige), enthält seine Tests und ist erst
fertig, wenn Tests, Lint und Build grün sind. Die Schritte bauen aufeinander auf;
nach jedem Schritt ist die App lauffähig.

## Offene Punkte (bitte vor Freigabe entscheiden)

Zu jedem Punkt steht ein Vorschlag. Ohne Rückmeldung wird der Vorschlag umgesetzt.

1. **Zeiten und Material in V1.** „Rechnung aus Auftrag" soll Zeiten und Material
   übernehmen, die Erfassung dafür steht aber erst in V2.
   *Vorschlag:* V1 enthält Tabellen, Repositories und eine einfache manuelle Eingabe
   im Auftragsdetail (Zeit: Datum, von/bis, Pause, Tätigkeit; Material: Artikel,
   Menge, Preis). V2 ergänzt Start/Stopp-Timer und die komfortable Erfassung.
2. **Stundensatz.** Ein Zeiteintrag hat keinen Preis.
   *Vorschlag:* In den Einstellungen wird ein Standard-Artikel vom Typ „Arbeit"
   als Stundensatz gewählt; beim Erzeugen der Rechnung werden die Zeiten damit
   bewertet. Der Preis ist im Rechnungsentwurf änderbar.
3. **Anfahrt.** *Vorschlag:* Anfahrt wird wie Material als Eintrag mit einem Artikel
   vom Typ „Anfahrt" erfasst (Materialeintrag nimmt jeden Artikeltyp auf); der Typ
   der Rechnungsposition kommt vom Artikel.
4. **Storno.** *Vorschlag:* Storno erzeugt eine Stornorechnung mit eigener
   fortlaufender Nummer, negativen Beträgen und Verweis auf die Originalrechnung
   (`stornoVonRechnungId`). Das Original erhält den Status „Storniert", der Auftrag
   geht zurück auf „Erledigt" und kann neu abgerechnet werden.
5. **Zeitpunkt der Nummernvergabe.** *Vorschlag:* Rechnungen bekommen ihre Nummer
   erst beim Festschreiben (Entwurf → Versendet), damit verworfene Entwürfe keine
   Lücken erzeugen. Aufträge bekommen sie beim Anlegen und können danach nicht mehr
   gelöscht werden. **Frage:** Braucht der Auftrag dafür einen Status
   „Storniert/Abgesagt" (z. B. Kunde springt ab)? Das Modell sieht keinen vor.
6. **Nummernformat.** *Vorschlag:* `RE-2026-0001`, `AU-2026-0001`, `AN-2026-0001`,
   Zähler beginnt jedes Jahr neu. Startwert einstellbar (für die Übernahme aus
   einem bisherigen System).
7. **Ergänzungen am Datenmodell** (in `CLAUDE.md` mit ⊕ markiert):
   - Rechnung: Empfänger-Snapshot (sonst ändert eine spätere Kundenänderung eine
     versendete Rechnung), `leistungsdatum` (Pflichtangabe nach § 14 UStG, Vorschlag:
     aus `auftrag.erledigtAm`), `stornoVonRechnungId`
   - Rechnungsposition: `einheit`, `position` (Reihenfolge)
   - Auftrag: `sortierung` (Reihenfolge innerhalb der Kanban-Spalte)
   - Einstellungen, Nummernkreis; alle Tabellen: `geaendertAm`, `geloeschtAm`
8. **Steuerliche Sonderfälle.** Ist der Betrieb Kleinunternehmer (§ 19 UStG, keine
   MwSt)? Kommen Bauleistungen an andere Bauunternehmer vor (§ 13b UStG,
   Steuerschuld des Leistungsempfängers)?
   *Vorschlag:* V1 geht von Regelbesteuerung aus; beide Fälle sind nicht enthalten.
9. **Mengen.** *Vorschlag:* Menge als Dezimalzahl mit höchstens drei Nachkommastellen
   (z. B. 1,5 h); Arbeitszeit wird auf Viertelstunden aufgerundet in die Rechnung
   übernommen. **Frage:** Passt Viertelstunden-Takt, oder minutengenau?
10. **Rechnungstexte.** Der genaue Wortlaut des Aufbewahrungshinweises, des
    § 35a-Ausweises und der Zahlungsbedingungen sollte einmal vom Steuerberater
    bestätigt werden. Ich liefere Standardformulierungen als einstellbare Texte.

## Schritte

### Schritt 1 – Projektgerüst
- Angular + Ionic + Capacitor (Android) aufsetzen, TypeScript `strict`, ESLint,
  Prettier, Ordnerstruktur laut `CLAUDE.md`
- App-Shell für Tablet-Querformat: Seitennavigation (Aufträge, Kunden, Artikel,
  Rechnungen, Einstellungen), Theme mit großen Bedienelementen, Querformat fixiert
- Befehle in `CLAUDE.md` eintragen
- **Tests:** Shell rendert, Navigation enthält alle fünf Bereiche und routet korrekt;
  Lint und Build laufen in einem `npm run check`

### Schritt 2 – Fachlogik: Geld, MwSt, Summen
- Reine Funktionen in `core/domain`: Positionsbetrag, Summen je Steuersatz,
  Summen je Typ (Arbeit/Material/Anfahrt), Netto/MwSt/Brutto, Formatieren und
  Parsen von Euro-Eingaben („12,50" ↔ 1250)
- **Tests:** Rundungsgrenzen (0,5 Cent), gemischte Steuersätze 19/7/0, MwSt je
  Steuersatz statt je Position, Summe der Typ-Zwischensummen = Gesamtnetto,
  negative Beträge (Storno), Parsen ungültiger Eingaben, keine Fließkomma-Artefakte
  (z. B. 3 × 0,10 €)

### Schritt 3 – Datenbank-Fundament
- DB-Adapter-Schnittstelle (`run`, `query`, `transaction`), Implementierung für das
  Capacitor-Plugin und für Tests (In-Memory-SQLite)
- Migrations-Runner mit `PRAGMA user_version`; Migration 001 mit allen V1-Tabellen,
  Fremdschlüsseln, Indizes und Check-Constraints für Enums
- Trigger: versendete/bezahlte/stornierte Rechnungen und ihre Positionen können
  nicht geändert oder gelöscht werden (Ausnahme: erlaubte Statuswechsel)
- **Tests:** Migration auf leerer DB, erneuter Start ist No-op, Fremdschlüssel
  greifen, Transaktion rollt bei Fehler zurück, Trigger weist Update/Delete einer
  versendeten Rechnung und ihrer Positionen ab und lässt Versendet → Bezahlt zu

### Schritt 4 – Nummernkreise
- `NummernkreisRepository.naechste(typ, jahr)` innerhalb einer Transaktion,
  Formatierung laut Einstellung
- **Tests:** fortlaufend ab 1, lückenlos über viele Vergaben, keine Nummer verbraucht
  bei Rollback, getrennte Kreise je Typ, Jahreswechsel, einstellbarer Startwert,
  Unique-Constraint verhindert doppelte Nummern

### Schritt 5 – Firmendaten und Einstellungen
- Repository + Seite: Firmendaten, Bankverbindung, Logo (Bildauswahl, Ablage im
  App-Verzeichnis), Zahlungsziel, Standard-Stundensatz, Nummernformate/Startwerte,
  Rechnungstexte
- **Tests:** Laden/Speichern, Standardwerte bei leerer DB, Validierung (IBAN-Prüfziffer,
  Pflichtfelder), Formular zeigt Fehler und speichert nur gültige Daten

### Schritt 6 – Kundenverwaltung
- `KundeRepository` (anlegen, ändern, Soft Delete, Suche über Name, Firma, Ort, PLZ,
  Telefon, E-Mail)
- Split-Ansicht: Liste mit Suchfeld links, Detail/Formular rechts; Privat/Gewerbe
  schaltet Felder um (Firma, USt-IdNr.)
- **Tests:** Repository-CRUD, Suche (Teiltreffer, Groß-/Kleinschreibung, Umlaute),
  gelöschte Kunden erscheinen nicht, Kunde mit Aufträgen/Rechnungen kann nicht
  gelöscht werden; Komponente: Suche filtert, Validierung (Name bzw. Firma Pflicht,
  PLZ, E-Mail), Typwechsel

### Schritt 7 – Artikel und Leistungen
- `ArtikelRepository`, Liste mit Filter nach Typ und Suche, Formular mit
  Euro-Eingabe, Einheit (Std, Stk, m, m², km, pauschal), MwSt-Satz
- **Tests:** Repository-CRUD und Filter, Preis wird als Cent gespeichert,
  Formularvalidierung, Soft Delete lässt bestehende Einträge/Rechnungen unberührt

### Schritt 8 – Aufträge: Repository und Detail
- `AuftragRepository` inkl. Nummernvergabe beim Anlegen, Statuswechsel-Regeln als
  reine Fachlogik
- Auftrag anlegen/bearbeiten: Kunde wählen (Suche), Titel, Beschreibung, Einsatzort
  („wie Rechnungsadresse" oder abweichend), geplantes Datum
- **Tests:** Nummer fortlaufend beim Anlegen, erlaubte/verbotene Statuswechsel,
  `erledigtAm` wird gesetzt bzw. zurückgesetzt, „Abgerechnet" nicht manuell setzbar,
  Einsatzort-Übernahme vom Kunden, Formularvalidierung

### Schritt 9 – Zeiten und Material am Auftrag (manuelle Eingabe)
- `ZeiteintragRepository`, `MaterialeintragRepository`; Bereiche im Auftragsdetail
  mit Listen, Hinzufügen/Bearbeiten/Löschen und Zwischensummen
- Gesperrt, sobald der Auftrag abgerechnet ist
- **Tests:** Dauerberechnung (Pause, über Mitternacht, Ende vor Start abgelehnt),
  Material übernimmt Artikelpreis als Vorschlag, Summen, Sperre bei „Abgerechnet"

### Schritt 10 – Kanban-Board
- Vier Spalten (Offen, In Arbeit, Erledigt, Abgerechnet), Karten mit Nummer, Titel,
  Kunde, Ort, Termin; Drag & Drop per Touch (Angular CDK), Reihenfolge in der Spalte
  bleibt erhalten; Tippen öffnet das Detail; Filter/Suche
- Spalte „Abgerechnet" ist kein Drop-Ziel; Ziehen dorthin bietet stattdessen
  „Rechnung erzeugen" an
- **Tests:** Aufträge stehen in der richtigen Spalte, Drop ändert Status und
  Sortierung dauerhaft, verbotener Drop wird abgewiesen und zurückgesetzt,
  abgerechnete Karten sind nicht ziehbar; ein Browser-Test (Playwright) für echtes
  Drag & Drop mit Touch-Eingabe

### Schritt 11 – Rechnung: Repository und Regeln
- `RechnungRepository`: Entwurf anlegen/ändern/löschen, **Festschreiben**
  (Nummer vergeben, Empfänger-Snapshot, Summen berechnen, Status „Versendet",
  Auftrag → „Abgerechnet", alles in einer Transaktion), „Bezahlt" markieren, Storno
- **Tests:** Entwurf ohne Nummer, Festschreiben vergibt nächste Nummer, gespeicherte
  Summen = berechnete Summen, festgeschriebene Rechnung nicht mehr änderbar
  (Repository und Trigger), spätere Kunden-/Artikeländerung lässt Rechnung unverändert,
  Storno erzeugt Gegenrechnung mit negativen Beträgen und setzt den Auftrag zurück,
  Fehler mitten im Festschreiben hinterlässt weder Nummer noch Teilzustand

### Schritt 12 – Rechnung aus Auftrag erzeugen
- `RechnungAusAuftragService`: übernimmt Kunde, Zeiten (bewertet mit dem
  Standard-Stundensatz, je Tätigkeit zusammengefasst), Material und Anfahrt als
  Positionen; Leistungsdatum aus `erledigtAm`; Fälligkeit aus Zahlungsziel
- Rechnungsentwurf-Ansicht: Positionen prüfen, ändern, ergänzen, sortieren;
  Live-Summen; „Festschreiben" mit deutlicher Sicherheitsabfrage
- Rechnungsliste mit Status-Filter und Suche
- **Tests:** Positionen und Typen korrekt übernommen, Zeitrundung, Auftrag ohne
  Einträge, nur erledigte Aufträge abrechenbar, kein zweiter Entwurf für denselben
  Auftrag, fehlender Stundensatz/fehlende Firmendaten führen zu klarer Meldung,
  Komponente rechnet Summen bei Änderungen neu

### Schritt 13 – PDF-Export
- Aufbereitung der Rechnung als reines Dokumentmodell (testbar ohne PDF-Bibliothek),
  daraus PDF: Logo, Absender, Empfänger, Rechnungsnummer, Datum, Leistungsdatum,
  Positionen gruppiert nach Arbeit/Material/Anfahrt mit Zwischensummen (§ 35a),
  MwSt je Satz, Brutto, Zahlungsziel, Bankverbindung, Steuernummer/USt-IdNr.,
  bei Privatkunden der Aufbewahrungshinweis; Entwürfe mit Wasserzeichen „Entwurf";
  Stornorechnung mit Verweis auf das Original
- Vorschau, Speichern im App-Verzeichnis, Teilen/Drucken über Android
- **Tests:** Dokumentmodell enthält alle Pflichtangaben nach § 14 UStG, drei getrennte
  Gruppen mit korrekten Zwischensummen, Hinweis nur bei Privatkunden, leere Gruppen
  entfallen, Entwurf-Kennzeichnung, Seitenumbruch bei vielen Positionen; erzeugtes
  PDF ist gültig und enthält die erwarteten Texte

### Schritt 14 – Datenexport und Abschluss V1
- Export-Funktion (Datenbank + Logo als Datei zum Teilen) und Wiederherstellen,
  als Überbrückung bis zum Cloud-Sync in V3
- Durchgängiger Ablauftest, Android-Build, Test auf dem Tablet, Kurzanleitung im README
- **Tests:** Export → Import ergibt identischen Datenbestand, Import einer älteren
  Schema-Version wird migriert; Browser-Test des Gesamtablaufs Kunde → Auftrag →
  Zeiten/Material → Erledigt → Rechnung → Festschreiben → PDF

## Nicht in V1

Start/Stopp-Zeiterfassung, Fotos, Angebote (V2); Unterschrift, Kalender, Mahnwesen,
Cloud-Sync, E-Rechnung (V3). Tabellen für Foto und Angebot kommen mit eigenen
Migrationen in V2.

Hinweis zur E-Rechnung: Rechnungen an Gewerbekunden müssen spätestens ab 2028 als
E-Rechnung ausgestellt werden (je nach Vorjahresumsatz bereits ab 2027). Falls der
Betrieb viele Gewerbekunden hat, sollte dieser Punkt aus V3 vorgezogen werden.
