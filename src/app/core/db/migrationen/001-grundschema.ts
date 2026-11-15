import type { Migration } from '../migrationen';

const META = `
  erstellt_am TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  geloescht_am TEXT`;

/** Alle Spalten einer Rechnung außer Status und Änderungszeitpunkt. */
const RECHNUNG_FESTE_SPALTEN = [
  'id',
  'nummer',
  'kunde_id',
  'auftrag_id',
  'datum',
  'faellig_am',
  'leistungsdatum',
  'summe_netto_cent',
  'summe_mwst_cent',
  'summe_brutto_cent',
  'empf_typ',
  'empf_firma',
  'empf_name',
  'empf_strasse',
  'empf_plz',
  'empf_ort',
  'empf_land',
  'empf_ust_id',
  'storno_von_rechnung_id',
  'erstellt_am',
  'geloescht_am',
];

const RECHNUNG_UNVERAENDERT = RECHNUNG_FESTE_SPALTEN.map((s) => `NEW.${s} IS OLD.${s}`).join(
  '\n    AND ',
);

export const MIGRATION_001: Migration = {
  version: 1,
  sql: `
CREATE TABLE kunde (
  id TEXT PRIMARY KEY,
  typ TEXT NOT NULL CHECK (typ IN ('Privat', 'Gewerbe')),
  firma TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  strasse TEXT NOT NULL DEFAULT '',
  plz TEXT NOT NULL DEFAULT '',
  ort TEXT NOT NULL DEFAULT '',
  land TEXT NOT NULL DEFAULT 'Deutschland',
  email TEXT NOT NULL DEFAULT '',
  telefon TEXT NOT NULL DEFAULT '',
  ust_id TEXT NOT NULL DEFAULT '',
  ${META}
);

CREATE TABLE artikel (
  id TEXT PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  einheit TEXT NOT NULL,
  nettopreis_cent INTEGER NOT NULL CHECK (typeof(nettopreis_cent) = 'integer'),
  mwst_satz INTEGER NOT NULL CHECK (typeof(mwst_satz) = 'integer' AND mwst_satz BETWEEN 0 AND 100),
  typ TEXT NOT NULL CHECK (typ IN ('Arbeit', 'Material', 'Anfahrt')),
  ${META}
);

CREATE TABLE rechnung (
  id TEXT PRIMARY KEY,
  nummer TEXT UNIQUE,
  kunde_id TEXT NOT NULL REFERENCES kunde (id),
  auftrag_id TEXT REFERENCES auftrag (id),
  datum TEXT NOT NULL,
  faellig_am TEXT NOT NULL,
  leistungsdatum TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Entwurf', 'Versendet', 'Bezahlt', 'Storniert')),
  summe_netto_cent INTEGER NOT NULL CHECK (typeof(summe_netto_cent) = 'integer'),
  summe_mwst_cent INTEGER NOT NULL CHECK (typeof(summe_mwst_cent) = 'integer'),
  summe_brutto_cent INTEGER NOT NULL CHECK (typeof(summe_brutto_cent) = 'integer'),
  empf_typ TEXT NOT NULL CHECK (empf_typ IN ('Privat', 'Gewerbe')),
  empf_firma TEXT NOT NULL DEFAULT '',
  empf_name TEXT NOT NULL DEFAULT '',
  empf_strasse TEXT NOT NULL DEFAULT '',
  empf_plz TEXT NOT NULL DEFAULT '',
  empf_ort TEXT NOT NULL DEFAULT '',
  empf_land TEXT NOT NULL DEFAULT '',
  empf_ust_id TEXT NOT NULL DEFAULT '',
  storno_von_rechnung_id TEXT REFERENCES rechnung (id),
  ${META},
  -- Entwürfe haben keine Nummer, festgeschriebene Rechnungen immer.
  CHECK ((status = 'Entwurf') = (nummer IS NULL))
);

CREATE TABLE auftrag (
  id TEXT PRIMARY KEY,
  nummer TEXT NOT NULL UNIQUE,
  kunde_id TEXT NOT NULL REFERENCES kunde (id),
  titel TEXT NOT NULL,
  beschreibung TEXT NOT NULL DEFAULT '',
  einsatzort_strasse TEXT NOT NULL DEFAULT '',
  einsatzort_plz TEXT NOT NULL DEFAULT '',
  einsatzort_ort TEXT NOT NULL DEFAULT '',
  einsatzort_land TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('Offen', 'InArbeit', 'Erledigt', 'Abgerechnet')),
  geplant_am TEXT,
  erledigt_am TEXT,
  rechnung_id TEXT REFERENCES rechnung (id),
  sortierung INTEGER NOT NULL DEFAULT 0,
  ${META}
);

CREATE TABLE zeiteintrag (
  id TEXT PRIMARY KEY,
  auftrag_id TEXT NOT NULL REFERENCES auftrag (id),
  start TEXT NOT NULL,
  ende TEXT NOT NULL,
  pause_minuten INTEGER NOT NULL DEFAULT 0 CHECK (pause_minuten >= 0),
  taetigkeit TEXT NOT NULL DEFAULT '',
  ${META},
  CHECK (ende > start)
);

CREATE TABLE materialeintrag (
  id TEXT PRIMARY KEY,
  auftrag_id TEXT NOT NULL REFERENCES auftrag (id),
  artikel_id TEXT NOT NULL REFERENCES artikel (id),
  menge REAL NOT NULL,
  einzelpreis_cent INTEGER NOT NULL CHECK (typeof(einzelpreis_cent) = 'integer'),
  ${META}
);

CREATE TABLE rechnungsposition (
  id TEXT PRIMARY KEY,
  rechnung_id TEXT NOT NULL REFERENCES rechnung (id),
  artikel_id TEXT REFERENCES artikel (id),
  beschreibung TEXT NOT NULL,
  menge REAL NOT NULL,
  einheit TEXT NOT NULL DEFAULT '',
  einzelpreis_cent INTEGER NOT NULL CHECK (typeof(einzelpreis_cent) = 'integer'),
  mwst_satz INTEGER NOT NULL CHECK (typeof(mwst_satz) = 'integer' AND mwst_satz BETWEEN 0 AND 100),
  typ TEXT NOT NULL CHECK (typ IN ('Arbeit', 'Material', 'Anfahrt')),
  position INTEGER NOT NULL
);

CREATE TABLE firmendaten (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  strasse TEXT NOT NULL DEFAULT '',
  plz TEXT NOT NULL DEFAULT '',
  ort TEXT NOT NULL DEFAULT '',
  land TEXT NOT NULL DEFAULT 'Deutschland',
  telefon TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  steuernummer TEXT NOT NULL DEFAULT '',
  ust_id TEXT NOT NULL DEFAULT '',
  bank_inhaber TEXT NOT NULL DEFAULT '',
  bank_iban TEXT NOT NULL DEFAULT '',
  bank_bic TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  logo TEXT,
  geaendert_am TEXT NOT NULL
);

CREATE TABLE einstellungen (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  zahlungsziel_tage INTEGER NOT NULL DEFAULT 14 CHECK (zahlungsziel_tage >= 0),
  standard_stundensatz_artikel_id TEXT REFERENCES artikel (id),
  praefix_rechnung TEXT NOT NULL DEFAULT 'RE',
  praefix_auftrag TEXT NOT NULL DEFAULT 'AU',
  praefix_angebot TEXT NOT NULL DEFAULT 'AN',
  text_aufbewahrung TEXT NOT NULL,
  text_arbeitskosten TEXT NOT NULL,
  text_zahlung TEXT NOT NULL,
  text_schluss TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
);

CREATE TABLE nummernkreis (
  typ TEXT NOT NULL CHECK (typ IN ('Rechnung', 'Angebot', 'Auftrag')),
  jahr INTEGER NOT NULL,
  startwert INTEGER NOT NULL DEFAULT 1 CHECK (startwert >= 1),
  naechste_nummer INTEGER NOT NULL CHECK (naechste_nummer >= startwert),
  PRIMARY KEY (typ, jahr)
);

CREATE INDEX idx_auftrag_kunde ON auftrag (kunde_id);
CREATE INDEX idx_auftrag_status ON auftrag (status, sortierung);
CREATE INDEX idx_zeiteintrag_auftrag ON zeiteintrag (auftrag_id);
CREATE INDEX idx_materialeintrag_auftrag ON materialeintrag (auftrag_id);
CREATE INDEX idx_rechnung_kunde ON rechnung (kunde_id);
CREATE INDEX idx_rechnung_auftrag ON rechnung (auftrag_id);
CREATE INDEX idx_rechnungsposition_rechnung ON rechnungsposition (rechnung_id, position);

-- Festgeschriebene Rechnungen sind unveränderlich. Erlaubt ist ausschließlich der
-- Statuswechsel Versendet -> Bezahlt/Storniert und Bezahlt -> Storniert.
CREATE TRIGGER rechnung_unveraenderlich
BEFORE UPDATE ON rechnung
WHEN OLD.status <> 'Entwurf' AND NOT (
    ${RECHNUNG_UNVERAENDERT}
    AND (
      (OLD.status = 'Versendet' AND NEW.status IN ('Bezahlt', 'Storniert'))
      OR (OLD.status = 'Bezahlt' AND NEW.status = 'Storniert')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Festgeschriebene Rechnungen sind unveränderlich.');
END;

CREATE TRIGGER rechnung_entwurf_nur_festschreiben
BEFORE UPDATE OF status ON rechnung
WHEN OLD.status = 'Entwurf' AND NEW.status NOT IN ('Entwurf', 'Versendet')
BEGIN
  SELECT RAISE(ABORT, 'Ein Entwurf kann nur festgeschrieben werden.');
END;

CREATE TRIGGER rechnung_nicht_loeschbar
BEFORE DELETE ON rechnung
WHEN OLD.status <> 'Entwurf'
BEGIN
  SELECT RAISE(ABORT, 'Festgeschriebene Rechnungen können nicht gelöscht werden.');
END;

CREATE TRIGGER rechnungsposition_insert_gesperrt
BEFORE INSERT ON rechnungsposition
WHEN (SELECT status FROM rechnung WHERE id = NEW.rechnung_id) <> 'Entwurf'
BEGIN
  SELECT RAISE(ABORT, 'Festgeschriebene Rechnungen sind unveränderlich.');
END;

CREATE TRIGGER rechnungsposition_update_gesperrt
BEFORE UPDATE ON rechnungsposition
WHEN (SELECT status FROM rechnung WHERE id = OLD.rechnung_id) <> 'Entwurf'
  OR (SELECT status FROM rechnung WHERE id = NEW.rechnung_id) <> 'Entwurf'
BEGIN
  SELECT RAISE(ABORT, 'Festgeschriebene Rechnungen sind unveränderlich.');
END;

CREATE TRIGGER rechnungsposition_delete_gesperrt
BEFORE DELETE ON rechnungsposition
WHEN (SELECT status FROM rechnung WHERE id = OLD.rechnung_id) <> 'Entwurf'
BEGIN
  SELECT RAISE(ABORT, 'Festgeschriebene Rechnungen sind unveränderlich.');
END;
`,
};
