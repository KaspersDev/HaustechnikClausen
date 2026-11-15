import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { MWST_SAETZE } from '../../core/domain/artikel';
import { formatiereDatum } from '../../core/domain/datum';
import {
  formatiereBetrag,
  formatiereEuro,
  parseEuro,
  positionsbetragCent,
} from '../../core/domain/geld';
import { adresszeile, kundenname } from '../../core/domain/kunde';
import {
  Rechnung,
  RechnungEntwurfDaten,
  RechnungspositionDaten,
  istStornorechnung,
  rechnungsart,
  summenVon,
} from '../../core/domain/rechnung';
import { POSITIONSTYPEN, PositionsTyp } from '../../core/domain/typen';
import { RECHNUNG_REPOSITORY } from '../../core/repositories/rechnung.repository';
import { PdfService } from '../../core/services/pdf.service';
import { Bestaetigung } from '../../shared/bestaetigung';
import { Fehlerliste } from '../../shared/fehlerliste';
import { Meldung, fehlerText } from '../../shared/meldung';
import { formatiereMenge, parseMenge } from '../../shared/validatoren';

type PositionForm = FormGroup<{
  artikelId: FormControl<string | null>;
  typ: FormControl<PositionsTyp>;
  beschreibung: FormControl<string>;
  menge: FormControl<string>;
  einheit: FormControl<string>;
  preis: FormControl<string>;
  mwstSatz: FormControl<number>;
}>;

const feld = <T>(wert: T): FormControl<T> => new FormControl(wert, { nonNullable: true });

function positionForm(p: RechnungspositionDaten | null): PositionForm {
  return new FormGroup({
    artikelId: new FormControl<string | null>(p?.artikelId ?? null),
    typ: feld<PositionsTyp>(p?.typ ?? 'Arbeit'),
    beschreibung: feld(p?.beschreibung ?? ''),
    menge: feld(p ? formatiereMenge(p.menge) : '1'),
    einheit: feld(p?.einheit ?? 'Std'),
    preis: feld(p ? formatiereBetrag(p.einzelpreisCent) : ''),
    mwstSatz: feld(p?.mwstSatz ?? 19),
  });
}

@Component({
  selector: 'app-rechnung-detail-page',
  imports: [
    ReactiveFormsModule,
    Fehlerliste,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './rechnung-detail.page.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/rechnungen" text="Rechnungen" />
        </ion-buttons>
        <ion-title>
          @if (rechnung(); as r) {
            {{ art(r) }} {{ r.nummer ?? '' }}
          }
        </ion-title>
        <ion-buttons slot="end">
          @if (rechnung(); as r) {
            <ion-button class="pdf" fill="outline" [disabled]="erzeugtPdf()" (click)="pdf()">
              {{ erzeugtPdf() ? 'PDF wird erzeugt …' : 'PDF' }}
            </ion-button>
            @if (r.status === 'Entwurf') {
              <ion-button class="speichern" fill="outline" (click)="speichern()"
                >Speichern</ion-button
              >
              <ion-button
                class="festschreiben"
                fill="solid"
                color="primary"
                (click)="festschreiben()"
              >
                Festschreiben
              </ion-button>
            } @else if (!istStorno()) {
              @if (r.status === 'Versendet') {
                <ion-button class="bezahlt" fill="solid" color="success" (click)="bezahlt()">
                  Als bezahlt markieren
                </ion-button>
              }
              @if (r.status !== 'Storniert') {
                <ion-button class="stornieren" fill="outline" color="danger" (click)="stornieren()">
                  Stornieren
                </ion-button>
              }
            }
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <app-fehlerliste [fehler]="fehler()" />
      @if (rechnung(); as r) {
        <div class="kopf">
          <section class="karte">
            <h2>Empfänger</h2>
            <div class="empfaenger">
              <strong>{{ name(r.empfaenger) }}</strong>
              @if (r.empfaenger.typ === 'Gewerbe' && r.empfaenger.name) {
                <div>{{ r.empfaenger.name }}</div>
              }
              <div>{{ adresse(r.empfaenger) || 'Keine Anschrift hinterlegt' }}</div>
            </div>
            <p class="hinweis status-text">
              Status: <strong class="status">{{ r.status }}</strong>
              @if (istStorno()) {
                · hebt eine frühere Rechnung auf
              }
            </p>
          </section>

          <section class="karte">
            <h2>Daten</h2>
            @if (istEntwurf()) {
              <form [formGroup]="form" class="felder">
                <ion-input
                  class="drittel"
                  formControlName="datum"
                  label="Rechnungsdatum *"
                  labelPlacement="stacked"
                  fill="outline"
                  type="date"
                />
                <ion-input
                  class="drittel"
                  formControlName="leistungsdatum"
                  label="Leistungsdatum *"
                  labelPlacement="stacked"
                  fill="outline"
                  type="date"
                />
                <ion-input
                  class="drittel"
                  formControlName="faelligAm"
                  label="Fällig am *"
                  labelPlacement="stacked"
                  fill="outline"
                  type="date"
                />
              </form>
            } @else {
              <dl class="daten">
                <dt>Rechnungsdatum</dt>
                <dd>{{ datum(r.datum) }}</dd>
                <dt>Leistungsdatum</dt>
                <dd>{{ datum(r.leistungsdatum) }}</dd>
                <dt>Fällig am</dt>
                <dd>{{ datum(r.faelligAm) }}</dd>
              </dl>
            }
          </section>
        </div>

        <section class="karte positionen">
          <h2>Positionen</h2>
          @if (istEntwurf()) {
            <form [formGroup]="form">
              <div formArrayName="positionen">
                @for (p of positionen.controls; track p; let i = $index) {
                  <div class="position" [formGroupName]="i">
                    <ion-select
                      class="typ"
                      formControlName="typ"
                      label="Typ"
                      labelPlacement="stacked"
                      fill="outline"
                      interface="popover"
                    >
                      @for (typ of typen; track typ) {
                        <ion-select-option [value]="typ">{{ typ }}</ion-select-option>
                      }
                    </ion-select>
                    <ion-input
                      class="beschreibung"
                      formControlName="beschreibung"
                      label="Beschreibung"
                      labelPlacement="stacked"
                      fill="outline"
                    />
                    <ion-input
                      class="menge"
                      formControlName="menge"
                      label="Menge"
                      labelPlacement="stacked"
                      fill="outline"
                      inputmode="decimal"
                    />
                    <ion-input
                      class="einheit"
                      formControlName="einheit"
                      label="Einheit"
                      labelPlacement="stacked"
                      fill="outline"
                    />
                    <ion-input
                      class="preis"
                      formControlName="preis"
                      label="Einzelpreis €"
                      labelPlacement="stacked"
                      fill="outline"
                      inputmode="decimal"
                    />
                    <ion-select
                      class="mwst"
                      formControlName="mwstSatz"
                      label="MwSt"
                      labelPlacement="stacked"
                      fill="outline"
                      interface="popover"
                    >
                      @for (satz of mwstSaetze; track satz) {
                        <ion-select-option [value]="satz">{{ satz }} %</ion-select-option>
                      }
                    </ion-select>
                    <div class="betrag zeilenbetrag">{{ zeilenbetrag(i) }}</div>
                    <div class="zeilenaktionen">
                      <ion-button
                        fill="clear"
                        [disabled]="i === 0"
                        (click)="verschiebe(i, -1)"
                        aria-label="Nach oben"
                        >↑</ion-button
                      >
                      <ion-button
                        fill="clear"
                        [disabled]="i === positionen.length - 1"
                        (click)="verschiebe(i, 1)"
                        aria-label="Nach unten"
                        >↓</ion-button
                      >
                      <ion-button
                        class="entfernen"
                        fill="clear"
                        color="danger"
                        (click)="entferne(i)"
                        aria-label="Position entfernen"
                        >✕</ion-button
                      >
                    </div>
                  </div>
                } @empty {
                  <p class="hinweis">Noch keine Positionen.</p>
                }
              </div>
            </form>
            <ion-button class="position-neu" fill="outline" (click)="neuePosition()">
              Position hinzufügen
            </ion-button>
          } @else {
            <table class="positionstabelle">
              <thead>
                <tr>
                  <th>Typ</th>
                  <th>Beschreibung</th>
                  <th class="betrag">Menge</th>
                  <th class="betrag">Einzelpreis</th>
                  <th class="betrag">MwSt</th>
                  <th class="betrag">Betrag</th>
                </tr>
              </thead>
              <tbody>
                @for (p of r.positionen; track p.id) {
                  <tr>
                    <td>{{ p.typ }}</td>
                    <td>{{ p.beschreibung }}</td>
                    <td class="betrag">{{ mengeText(p.menge) }} {{ p.einheit }}</td>
                    <td class="betrag">{{ euro(p.einzelpreisCent) }}</td>
                    <td class="betrag">{{ p.mwstSatz }} %</td>
                    <td class="betrag">{{ euro(betrag(p)) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }

          @let s = summen();
          <dl class="summen">
            @for (typ of typen; track typ) {
              @if (s.jeTyp[typ] !== 0) {
                <dt>{{ typ }}</dt>
                <dd class="betrag typ-summe">{{ euro(s.jeTyp[typ]) }}</dd>
              }
            }
            <dt class="linie">Summe netto</dt>
            <dd class="betrag linie netto">{{ euro(s.nettoCent) }}</dd>
            @for (satz of s.jeSteuersatz; track satz.mwstSatz) {
              <dt>MwSt {{ satz.mwstSatz }} %</dt>
              <dd class="betrag">{{ euro(satz.mwstCent) }}</dd>
            }
            <dt class="gesamt">Gesamt brutto</dt>
            <dd class="betrag gesamt brutto">{{ euro(s.bruttoCent) }}</dd>
          </dl>
        </section>

        @if (istEntwurf()) {
          <div class="aktionen">
            <ion-button class="entwurf-loeschen" fill="clear" color="danger" (click)="loeschen()">
              Entwurf löschen
            </ion-button>
          </div>
        }
      }
    </ion-content>
  `,
})
export class RechnungDetailPage {
  private readonly repo = inject(RECHNUNG_REPOSITORY);
  private readonly router = inject(Router);
  private readonly pdfService = inject(PdfService);
  private readonly meldung = inject(Meldung);
  private readonly bestaetigung = inject(Bestaetigung);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly typen = POSITIONSTYPEN;
  protected readonly mwstSaetze = MWST_SAETZE;
  protected readonly euro = formatiereEuro;
  protected readonly datum = formatiereDatum;
  protected readonly mengeText = formatiereMenge;
  protected readonly name = kundenname;
  protected readonly adresse = adresszeile;
  protected readonly art = rechnungsart;
  protected readonly betrag = (p: RechnungspositionDaten): number =>
    positionsbetragCent(p.menge, p.einzelpreisCent);

  readonly rechnung = signal<Rechnung | null>(null);
  readonly fehler = signal<readonly string[]>([]);
  protected readonly erzeugtPdf = signal(false);
  readonly istEntwurf = computed(() => this.rechnung()?.status === 'Entwurf');
  readonly istStorno = computed(() => {
    const r = this.rechnung();
    return r !== null && istStornorechnung(r);
  });

  readonly positionen = new FormArray<PositionForm>([]);
  readonly form = new FormGroup({
    datum: feld(''),
    leistungsdatum: feld(''),
    faelligAm: feld(''),
    positionen: this.positionen,
  });

  private readonly formWert = toSignal(this.form.valueChanges, { initialValue: null });

  /** Im Entwurf live aus dem Formular, sonst aus den festgeschriebenen Positionen. */
  readonly summen = computed(() => {
    this.formWert();
    const r = this.rechnung();
    return summenVon(
      r?.status === 'Entwurf' ? this.lesePositionen().gueltig : (r?.positionen ?? []),
    );
  });

  readonly geladen: Promise<void> = this.laden();

  async laden(): Promise<void> {
    const rechnung = await this.repo.finde(this.id);
    if (!rechnung) {
      this.fehler.set(['Die Rechnung wurde nicht gefunden.']);
      return;
    }
    this.zeige(rechnung);
  }

  neuePosition(): void {
    this.positionen.push(positionForm(null));
  }

  entferne(index: number): void {
    this.positionen.removeAt(index);
  }

  verschiebe(index: number, richtung: -1 | 1): void {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= this.positionen.length) {
      return;
    }
    const position = this.positionen.at(index);
    this.positionen.removeAt(index);
    this.positionen.insert(ziel, position);
  }

  protected zeilenbetrag(index: number): string {
    this.formWert();
    const w = this.positionen.at(index).getRawValue();
    const menge = parseMenge(w.menge);
    const preis = parseEuro(w.preis);
    return menge !== null && preis !== null
      ? formatiereEuro(positionsbetragCent(menge, preis))
      : '–';
  }

  async speichern(): Promise<boolean> {
    const rechnung = this.rechnung();
    if (!rechnung || rechnung.status !== 'Entwurf') {
      return false;
    }
    const { gueltig, fehler } = this.lesePositionen();
    this.fehler.set(fehler);
    if (fehler.length > 0) {
      return false;
    }
    const w = this.form.getRawValue();
    const daten: RechnungEntwurfDaten = {
      kundeId: rechnung.kundeId,
      auftragId: rechnung.auftragId,
      datum: w.datum,
      leistungsdatum: w.leistungsdatum,
      faelligAm: w.faelligAm,
      positionen: gueltig,
    };
    try {
      this.zeige(await this.repo.entwurfAendern(rechnung.id, daten));
      return true;
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
      return false;
    }
  }

  async festschreiben(): Promise<void> {
    if (!(await this.speichern())) {
      return;
    }
    const rechnung = this.rechnung();
    if (!rechnung) {
      return;
    }
    const bestaetigt = await this.bestaetigung.frage(
      'Rechnung festschreiben?',
      `Die Rechnung über ${formatiereEuro(rechnung.summeBruttoCent)} erhält ihre Rechnungsnummer und kann danach nicht mehr geändert werden. Korrekturen sind dann nur noch per Storno möglich.`,
      'Festschreiben',
    );
    if (!bestaetigt) {
      return;
    }
    await this.ausfuehren(() => this.repo.festschreiben(rechnung.id), 'Rechnung festgeschrieben');
  }

  async bezahlt(): Promise<void> {
    const rechnung = this.rechnung();
    if (!rechnung) {
      return;
    }
    const bestaetigt = await this.bestaetigung.frage(
      'Als bezahlt markieren?',
      `Zahlungseingang für ${rechnung.nummer ?? 'die Rechnung'} über ${formatiereEuro(rechnung.summeBruttoCent)} bestätigen. Das lässt sich nicht zurücknehmen.`,
      'Bezahlt',
    );
    if (bestaetigt) {
      await this.ausfuehren(
        () => this.repo.alsBezahltMarkieren(rechnung.id),
        'Als bezahlt markiert',
      );
    }
  }

  async stornieren(): Promise<void> {
    const rechnung = this.rechnung();
    if (!rechnung) {
      return;
    }
    const bestaetigt = await this.bestaetigung.frage(
      'Rechnung stornieren?',
      `Zu ${rechnung.nummer ?? 'der Rechnung'} wird eine Stornorechnung mit eigener Nummer erzeugt. Der Auftrag kann danach neu abgerechnet werden.`,
      'Stornieren',
    );
    if (!bestaetigt) {
      return;
    }
    try {
      const storno = await this.repo.stornieren(rechnung.id);
      await this.meldung.erfolg(`Storniert mit ${storno.nummer ?? 'Stornorechnung'}`);
      await this.laden();
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
    }
  }

  async loeschen(): Promise<void> {
    const rechnung = this.rechnung();
    if (!rechnung) {
      return;
    }
    const bestaetigt = await this.bestaetigung.frage(
      'Entwurf löschen?',
      'Der Rechnungsentwurf wird verworfen. Zeiten und Material am Auftrag bleiben erhalten.',
      'Löschen',
    );
    if (!bestaetigt) {
      return;
    }
    try {
      await this.repo.entwurfLoeschen(rechnung.id);
      await this.meldung.erfolg('Entwurf gelöscht');
      await this.router.navigate(['/rechnungen'], { replaceUrl: true });
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
    }
  }

  /** Erzeugt das PDF; ungespeicherte Änderungen am Entwurf werden vorher gespeichert. */
  async pdf(): Promise<void> {
    const rechnung = this.rechnung();
    if (!rechnung || (rechnung.status === 'Entwurf' && !(await this.speichern()))) {
      return;
    }
    this.erzeugtPdf.set(true);
    try {
      await this.pdfService.oeffne(rechnung.id);
    } catch (fehler) {
      this.fehler.set([`Das PDF konnte nicht erzeugt werden: ${fehlerText(fehler)}`]);
    } finally {
      this.erzeugtPdf.set(false);
    }
  }

  private async ausfuehren(aktion: () => Promise<Rechnung>, erfolg: string): Promise<void> {
    try {
      this.zeige(await aktion());
      await this.meldung.erfolg(erfolg);
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
    }
  }

  private zeige(rechnung: Rechnung): void {
    this.positionen.clear({ emitEvent: false });
    for (const p of rechnung.positionen) {
      this.positionen.push(positionForm(p), { emitEvent: false });
    }
    this.form.patchValue({
      datum: rechnung.datum,
      leistungsdatum: rechnung.leistungsdatum,
      faelligAm: rechnung.faelligAm,
    });
    this.fehler.set([]);
    this.rechnung.set(rechnung);
  }

  private lesePositionen(): { gueltig: RechnungspositionDaten[]; fehler: string[] } {
    const gueltig: RechnungspositionDaten[] = [];
    const fehler: string[] = [];
    this.positionen.controls.forEach((control, index) => {
      const w = control.getRawValue();
      const menge = parseMenge(w.menge);
      const preis = parseEuro(w.preis);
      const nr = index + 1;
      if (w.beschreibung.trim() === '') fehler.push(`Position ${nr}: Beschreibung fehlt`);
      if (menge === null) fehler.push(`Position ${nr}: ungültige Menge`);
      if (preis === null || preis < 0) fehler.push(`Position ${nr}: ungültiger Preis`);
      if (menge !== null && preis !== null && preis >= 0) {
        gueltig.push({
          artikelId: w.artikelId,
          typ: w.typ,
          beschreibung: w.beschreibung,
          menge,
          einheit: w.einheit,
          einzelpreisCent: preis,
          mwstSatz: Number(w.mwstSatz),
        });
      }
    });
    return { gueltig, fehler };
  }
}
