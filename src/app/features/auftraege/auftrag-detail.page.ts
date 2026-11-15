import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import {
  AUFTRAG_STATUS,
  AuftragDaten,
  AuftragMitKunde,
  AuftragStatus,
  STATUS_TITEL,
  gleicheAdresse,
} from '../../core/domain/auftrag';
import { formatiereDatum } from '../../core/domain/datum';
import { Adresse, Kunde, adresszeile, kundenname } from '../../core/domain/kunde';
import { AUFTRAG_REPOSITORY } from '../../core/repositories/auftrag.repository';
import { KUNDE_REPOSITORY } from '../../core/repositories/kunde.repository';
import { Fehlerliste } from '../../shared/fehlerliste';
import { Meldung, fehlerText } from '../../shared/meldung';
import { formularFehler, pflicht, plz } from '../../shared/validatoren';
import { MaterialKarte } from './material-karte';
import { ZeitenKarte } from './zeiten-karte';

const text = (): FormControl<string> => new FormControl('', { nonNullable: true });
const MAX_KUNDENTREFFER = 8;

@Component({
  selector: 'app-auftrag-detail-page',
  imports: [
    ReactiveFormsModule,
    Fehlerliste,
    MaterialKarte,
    ZeitenKarte,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCheckbox,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .kunde-zeile {
      align-items: center;
      display: flex;
      gap: 12px;
      justify-content: space-between;
    }
    .kunde-name {
      font-size: 1.1rem;
      font-weight: 600;
    }
    .status-zeile {
      margin-bottom: 16px;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/auftraege" text="Aufträge" />
        </ion-buttons>
        <ion-title>
          @if (auftrag(); as a) {
            {{ a.nummer }} · {{ a.titel }}
          } @else {
            Neuer Auftrag
          }
        </ion-title>
        @if (!gesperrt()) {
          <ion-buttons slot="end">
            <ion-button class="speichern" fill="solid" color="primary" (click)="speichern()">
              Speichern
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <app-fehlerliste [fehler]="fehler()" />

      @if (auftrag(); as a) {
        <div class="status-zeile">
          @if (gesperrt()) {
            <p class="hinweis abgerechnet">
              Dieser Auftrag ist abgerechnet und kann nicht mehr geändert werden.
            </p>
          } @else {
            <ion-segment [value]="a.status" (ionChange)="setzeStatus($event.detail.value)">
              @for (status of waehlbareStatus; track status) {
                <ion-segment-button [value]="status">{{ statusTitel[status] }}</ion-segment-button>
              }
            </ion-segment>
          }
          @if (a.erledigtAm) {
            <p class="hinweis">Erledigt am {{ datum(a.erledigtAm) }}</p>
          }
        </div>
      }

      <div class="karten">
        <form [formGroup]="form" class="karte">
          <h2>Auftrag</h2>
          <div class="felder">
            <div>
              @if (kunde(); as k) {
                <div class="kunde-zeile">
                  <div>
                    <div class="kunde-name">{{ name(k) }}</div>
                    <div class="hinweis">{{ adresse(k) }}</div>
                  </div>
                  @if (!gesperrt()) {
                    <ion-button class="kunde-aendern" fill="outline" (click)="oeffneKundenwahl()">
                      Ändern
                    </ion-button>
                  }
                </div>
              }
              @if (kundenwahlOffen()) {
                <ion-searchbar
                  placeholder="Kunde suchen …"
                  [debounce]="200"
                  (ionInput)="sucheKunden($event.detail.value ?? '')"
                />
                <ion-list>
                  @for (k of kundenTreffer(); track k.id) {
                    <ion-item
                      button
                      [detail]="false"
                      class="kundentreffer"
                      (click)="waehleKunde(k)"
                    >
                      <ion-label>
                        <h3>{{ name(k) }}</h3>
                        <p>{{ adresse(k) }}</p>
                      </ion-label>
                    </ion-item>
                  } @empty {
                    <p class="hinweis">
                      Kein Kunde gefunden. Kunden werden unter „Kunden" angelegt.
                    </p>
                  }
                </ion-list>
              }
            </div>
            <ion-input
              formControlName="titel"
              label="Titel *"
              labelPlacement="stacked"
              fill="outline"
              placeholder="z. B. Zaun reparieren"
            />
            <ion-textarea
              formControlName="beschreibung"
              label="Beschreibung"
              labelPlacement="stacked"
              fill="outline"
              [autoGrow]="true"
              [rows]="3"
            />
            <ion-input
              class="halb"
              formControlName="geplantAm"
              label="Geplant am"
              labelPlacement="stacked"
              fill="outline"
              type="date"
            />
          </div>
        </form>

        <form [formGroup]="form" class="karte">
          <h2>Einsatzort</h2>
          <div class="felder">
            <ion-checkbox formControlName="einsatzortWieKunde" labelPlacement="end" justify="start">
              Wie Rechnungsadresse des Kunden
            </ion-checkbox>
            @if (einsatzortWieKunde()) {
              <p class="hinweis einsatzort-kunde">
                {{
                  kunde() ? adresse(kunde()!) || 'Beim Kunden ist keine Anschrift hinterlegt.' : ''
                }}
              </p>
            } @else {
              <ion-input
                formControlName="strasse"
                label="Straße und Hausnummer"
                labelPlacement="stacked"
                fill="outline"
              />
              <ion-input
                class="drittel"
                formControlName="plz"
                label="PLZ"
                labelPlacement="stacked"
                fill="outline"
                inputmode="numeric"
              />
              <ion-input
                class="zweidrittel"
                formControlName="ort"
                label="Ort"
                labelPlacement="stacked"
                fill="outline"
              />
              <ion-input
                formControlName="land"
                label="Land"
                labelPlacement="stacked"
                fill="outline"
              />
            }
          </div>
        </form>

        @if (auftrag(); as a) {
          <app-zeiten-karte [auftragId]="a.id" [gesperrt]="gesperrt()" />
          <app-material-karte [auftragId]="a.id" [gesperrt]="gesperrt()" />
        }
      </div>
    </ion-content>
  `,
})
export class AuftragDetailPage {
  private readonly repo = inject(AUFTRAG_REPOSITORY);
  private readonly kundenRepo = inject(KUNDE_REPOSITORY);
  private readonly router = inject(Router);
  private readonly meldung = inject(Meldung);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  protected readonly waehlbareStatus = AUFTRAG_STATUS.filter((s) => s !== 'Abgerechnet');
  protected readonly statusTitel = STATUS_TITEL;
  protected readonly name = kundenname;
  protected readonly adresse = adresszeile;
  protected readonly datum = formatiereDatum;

  readonly auftrag = signal<AuftragMitKunde | null>(null);
  readonly kunde = signal<Kunde | null>(null);
  readonly kundenwahlOffen = signal(false);
  readonly kundenTreffer = signal<readonly Kunde[]>([]);
  readonly fehler = signal<readonly string[]>([]);
  readonly gesperrt = computed(() => this.auftrag()?.status === 'Abgerechnet');

  readonly form = new FormGroup({
    titel: new FormControl('', { nonNullable: true, validators: [pflicht] }),
    beschreibung: text(),
    geplantAm: text(),
    einsatzortWieKunde: new FormControl(true, { nonNullable: true }),
    strasse: text(),
    plz: new FormControl('', { nonNullable: true, validators: [plz('land')] }),
    ort: text(),
    land: new FormControl('Deutschland', { nonNullable: true }),
  });

  protected readonly einsatzortWieKunde = toSignal(
    this.form.controls.einsatzortWieKunde.valueChanges,
    { initialValue: true },
  );

  readonly geladen: Promise<void> = this.laden();

  async laden(): Promise<void> {
    if (!this.id) {
      await this.oeffneKundenwahl();
      return;
    }
    const auftrag = await this.repo.finde(this.id);
    if (!auftrag) {
      this.fehler.set(['Der Auftrag wurde nicht gefunden.']);
      return;
    }
    const kunde = await this.kundenRepo.finde(auftrag.kundeId);
    this.auftrag.set(auftrag);
    this.kunde.set(kunde);
    this.kundenwahlOffen.set(false);
    this.form.reset({
      titel: auftrag.titel,
      beschreibung: auftrag.beschreibung,
      geplantAm: auftrag.geplantAm ?? '',
      einsatzortWieKunde: kunde !== null && gleicheAdresse(auftrag.einsatzort, kunde),
      ...auftrag.einsatzort,
    });
    if (auftrag.status === 'Abgerechnet') {
      this.form.disable();
    }
  }

  async oeffneKundenwahl(): Promise<void> {
    this.kundenwahlOffen.set(true);
    await this.sucheKunden('');
  }

  async sucheKunden(suche: string): Promise<void> {
    this.kundenTreffer.set((await this.kundenRepo.alle(suche)).slice(0, MAX_KUNDENTREFFER));
  }

  waehleKunde(kunde: Kunde): void {
    this.kunde.set(kunde);
    this.kundenwahlOffen.set(false);
  }

  async speichern(): Promise<boolean> {
    const fehler = formularFehler(this.form, { titel: 'Titel', plz: 'PLZ' });
    const kunde = this.kunde();
    if (!kunde) {
      fehler.unshift('Kunde: bitte auswählen');
    }
    this.fehler.set(fehler);
    if (fehler.length > 0 || !kunde) {
      return false;
    }
    const w = this.form.getRawValue();
    const einsatzort: Adresse = w.einsatzortWieKunde
      ? { strasse: kunde.strasse, plz: kunde.plz, ort: kunde.ort, land: kunde.land }
      : { strasse: w.strasse, plz: w.plz, ort: w.ort, land: w.land };
    const daten: AuftragDaten = {
      kundeId: kunde.id,
      titel: w.titel,
      beschreibung: w.beschreibung,
      einsatzort,
      geplantAm: w.geplantAm === '' ? null : w.geplantAm,
    };
    try {
      const vorhanden = this.auftrag();
      if (vorhanden) {
        await this.repo.aendern(vorhanden.id, daten);
        await this.laden();
      } else {
        const neu = await this.repo.anlegen(daten);
        await this.router.navigate(['/auftraege', neu.id], { replaceUrl: true });
      }
      await this.meldung.erfolg('Auftrag gespeichert');
      return true;
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
      return false;
    }
  }

  async setzeStatus(wert: unknown): Promise<void> {
    const auftrag = this.auftrag();
    const status = AUFTRAG_STATUS.find((s) => s === wert);
    if (!auftrag || !status || status === auftrag.status) {
      return;
    }
    try {
      await this.repo.verschiebe(auftrag.id, status as AuftragStatus);
      const neu = await this.repo.finde(auftrag.id);
      this.auftrag.set(neu);
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
    }
  }
}
