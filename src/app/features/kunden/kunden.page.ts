import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import {
  Kunde,
  KundeDaten,
  KundenTyp,
  LEERER_KUNDE,
  adresszeile,
  kundenname,
} from '../../core/domain/kunde';
import { KUNDE_REPOSITORY } from '../../core/repositories/kunde.repository';
import { Bestaetigung } from '../../shared/bestaetigung';
import { Fehlerliste } from '../../shared/fehlerliste';
import { Meldung, fehlerText } from '../../shared/meldung';
import { email, formularFehler, plz, ustId } from '../../shared/validatoren';

const text = (): FormControl<string> => new FormControl('', { nonNullable: true });

@Component({
  selector: 'app-kunden-page',
  imports: [
    ReactiveFormsModule,
    Fehlerliste,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Kunden</ion-title>
        <ion-buttons slot="end">
          <ion-button class="neu" fill="solid" color="primary" (click)="neu()">
            Neuer Kunde
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content [scrollY]="false">
      <div class="split">
        <div class="split-liste">
          <ion-searchbar
            placeholder="Name, Firma, Ort, Telefon …"
            [debounce]="200"
            [value]="suche()"
            (ionInput)="setzeSuche($event.detail.value ?? '')"
          />
          <div class="scroll">
            <ion-list>
              @for (kunde of kunden(); track kunde.id) {
                <ion-item
                  button
                  [detail]="false"
                  [class.gewaehlt]="kunde.id === gewaehlteId()"
                  (click)="waehle(kunde)"
                >
                  <ion-label>
                    <h2>{{ name(kunde) }}</h2>
                    <p>{{ adresse(kunde) }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ kunde.typ }}</ion-note>
                </ion-item>
              } @empty {
                <p class="leer">
                  {{ suche() ? 'Keine Kunden gefunden.' : 'Noch keine Kunden angelegt.' }}
                </p>
              }
            </ion-list>
          </div>
        </div>

        <div class="split-detail">
          @if (auswahl(); as aktuell) {
            <app-fehlerliste [fehler]="fehler()" />
            <form [formGroup]="form" class="karte">
              <h2>{{ aktuell === 'neu' ? 'Neuer Kunde' : name(aktuell) }}</h2>
              <div class="felder">
                <ion-segment formControlName="typ">
                  <ion-segment-button value="Privat">Privatkunde</ion-segment-button>
                  <ion-segment-button value="Gewerbe">Gewerbekunde</ion-segment-button>
                </ion-segment>
                @if (istGewerbe()) {
                  <ion-input
                    formControlName="firma"
                    label="Firma *"
                    labelPlacement="stacked"
                    fill="outline"
                  />
                }
                <ion-input
                  formControlName="name"
                  [label]="istGewerbe() ? 'Ansprechperson' : 'Name *'"
                  labelPlacement="stacked"
                  fill="outline"
                />
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
                <ion-input
                  class="halb"
                  formControlName="telefon"
                  label="Telefon"
                  labelPlacement="stacked"
                  fill="outline"
                  type="tel"
                />
                <ion-input
                  class="halb"
                  formControlName="email"
                  label="E-Mail"
                  labelPlacement="stacked"
                  fill="outline"
                  type="email"
                />
                @if (istGewerbe()) {
                  <ion-input
                    formControlName="ustId"
                    label="USt-IdNr."
                    labelPlacement="stacked"
                    fill="outline"
                  />
                }
              </div>
              <p class="hinweis">Für Rechnungen wird die vollständige Anschrift benötigt.</p>
              <div class="aktionen">
                @if (aktuell !== 'neu') {
                  <ion-button class="loeschen" fill="clear" color="danger" (click)="loeschen()">
                    Löschen
                  </ion-button>
                }
                <span class="abstand"></span>
                <ion-button fill="outline" (click)="abbrechen()">Abbrechen</ion-button>
                <ion-button class="speichern" (click)="speichern()">Speichern</ion-button>
              </div>
            </form>
          } @else {
            <p class="leer">Kunden auswählen oder neu anlegen.</p>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class KundenPage {
  private readonly repo = inject(KUNDE_REPOSITORY);
  private readonly meldung = inject(Meldung);
  private readonly bestaetigung = inject(Bestaetigung);

  readonly kunden = signal<readonly Kunde[]>([]);
  readonly suche = signal('');
  readonly auswahl = signal<Kunde | 'neu' | null>(null);
  readonly fehler = signal<readonly string[]>([]);

  protected readonly gewaehlteId = computed(() => {
    const aktuell = this.auswahl();
    return aktuell && aktuell !== 'neu' ? aktuell.id : null;
  });
  protected readonly name = kundenname;
  protected readonly adresse = adresszeile;

  readonly form = new FormGroup({
    typ: new FormControl<KundenTyp>('Privat', { nonNullable: true }),
    firma: text(),
    name: text(),
    strasse: text(),
    plz: new FormControl('', { nonNullable: true, validators: [plz('land')] }),
    ort: text(),
    land: text(),
    email: new FormControl('', { nonNullable: true, validators: [email] }),
    telefon: text(),
    ustId: new FormControl('', { nonNullable: true, validators: [ustId] }),
  });

  private readonly typ = toSignal(this.form.controls.typ.valueChanges, {
    initialValue: this.form.controls.typ.value,
  });
  readonly istGewerbe = computed(() => this.typ() === 'Gewerbe');

  readonly geladen: Promise<void> = this.laden();

  async laden(): Promise<void> {
    this.kunden.set(await this.repo.alle(this.suche()));
  }

  setzeSuche(suche: string): Promise<void> {
    this.suche.set(suche);
    return this.laden();
  }

  neu(): void {
    this.oeffne('neu', LEERER_KUNDE);
  }

  waehle(kunde: Kunde): void {
    this.oeffne(kunde, kunde);
  }

  abbrechen(): void {
    this.auswahl.set(null);
    this.fehler.set([]);
  }

  async speichern(): Promise<boolean> {
    const aktuell = this.auswahl();
    if (!aktuell) {
      return false;
    }
    const daten: KundeDaten = this.form.getRawValue();
    const fehler = formularFehler(this.form, {
      plz: 'PLZ',
      email: 'E-Mail',
      ...(daten.typ === 'Gewerbe' ? { ustId: 'USt-IdNr.' } : {}),
    });
    if (daten.typ === 'Gewerbe' && daten.firma.trim() === '') {
      fehler.unshift('Firma: bitte ausfüllen');
    }
    if (daten.typ === 'Privat' && daten.name.trim() === '') {
      fehler.unshift('Name: bitte ausfüllen');
    }
    this.fehler.set(fehler);
    if (fehler.length > 0) {
      return false;
    }
    try {
      const gespeichert =
        aktuell === 'neu'
          ? await this.repo.anlegen(daten)
          : await this.repo.aendern(aktuell.id, daten);
      await this.laden();
      this.oeffne(gespeichert, gespeichert);
      await this.meldung.erfolg('Kunde gespeichert');
      return true;
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
      return false;
    }
  }

  async loeschen(): Promise<void> {
    const aktuell = this.auswahl();
    if (!aktuell || aktuell === 'neu') {
      return;
    }
    const bestaetigt = await this.bestaetigung.frage(
      'Kunden löschen?',
      `${kundenname(aktuell)} wird aus der Kundenliste entfernt.`,
      'Löschen',
    );
    if (!bestaetigt) {
      return;
    }
    try {
      await this.repo.loeschen(aktuell.id);
      this.abbrechen();
      await this.laden();
      await this.meldung.erfolg('Kunde gelöscht');
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
    }
  }

  private oeffne(auswahl: Kunde | 'neu', daten: KundeDaten): void {
    this.form.reset({
      typ: daten.typ,
      firma: daten.firma,
      name: daten.name,
      strasse: daten.strasse,
      plz: daten.plz,
      ort: daten.ort,
      land: daten.land,
      email: daten.email,
      telefon: daten.telefon,
      ustId: daten.ustId,
    });
    this.fehler.set([]);
    this.auswahl.set(auswahl);
  }
}
