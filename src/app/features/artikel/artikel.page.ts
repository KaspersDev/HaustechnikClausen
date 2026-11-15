import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
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
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import {
  Artikel,
  ArtikelDaten,
  EINHEITEN,
  LEERER_ARTIKEL,
  MWST_SAETZE,
  STANDARD_EINHEIT,
} from '../../core/domain/artikel';
import { formatiereBetrag, formatiereEuro, parseEuro } from '../../core/domain/geld';
import { POSITIONSTYPEN, PositionsTyp } from '../../core/domain/typen';
import { ARTIKEL_REPOSITORY } from '../../core/repositories/artikel.repository';
import { EINSTELLUNGEN_REPOSITORY } from '../../core/repositories/firma.repository';
import { Bestaetigung } from '../../shared/bestaetigung';
import { Fehlerliste } from '../../shared/fehlerliste';
import { Meldung, fehlerText } from '../../shared/meldung';
import { euroNichtNegativ, formularFehler, pflicht } from '../../shared/validatoren';

type TypFilter = PositionsTyp | 'Alle';

@Component({
  selector: 'app-artikel-page',
  imports: [
    ReactiveFormsModule,
    Fehlerliste,
    IonButton,
    IonButtons,
    IonCheckbox,
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
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Artikel &amp; Leistungen</ion-title>
        <ion-buttons slot="end">
          <ion-button class="neu" fill="solid" color="primary" (click)="neu()">
            Neuer Artikel
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content [scrollY]="false">
      <div class="split">
        <div class="split-liste">
          <ion-searchbar
            placeholder="Bezeichnung …"
            [debounce]="200"
            [value]="suche()"
            (ionInput)="setzeSuche($event.detail.value ?? '')"
          />
          <ion-segment [value]="typFilter()" (ionChange)="setzeTypFilter($event.detail.value)">
            <ion-segment-button value="Alle">Alle</ion-segment-button>
            @for (typ of typen; track typ) {
              <ion-segment-button [value]="typ">{{ typ }}</ion-segment-button>
            }
          </ion-segment>
          <div class="scroll">
            <ion-list>
              @for (artikel of artikelListe(); track artikel.id) {
                <ion-item
                  button
                  [detail]="false"
                  [class.gewaehlt]="artikel.id === gewaehlteId()"
                  (click)="waehle(artikel)"
                >
                  <ion-label>
                    <h2>{{ artikel.bezeichnung }}</h2>
                    <p>
                      {{ artikel.typ }}
                      @if (artikel.id === stundensatzId()) {
                        · Standard-Stundensatz
                      }
                    </p>
                  </ion-label>
                  <ion-note slot="end" class="betrag">
                    {{ euro(artikel.nettopreisCent) }} / {{ artikel.einheit }}
                  </ion-note>
                </ion-item>
              } @empty {
                <p class="leer">
                  {{
                    suche() || typFilter() !== 'Alle'
                      ? 'Keine Artikel gefunden.'
                      : 'Noch keine Artikel angelegt.'
                  }}
                </p>
              }
            </ion-list>
          </div>
        </div>

        <div class="split-detail">
          @if (auswahl(); as aktuell) {
            <app-fehlerliste [fehler]="fehler()" />
            <form [formGroup]="form" class="karte">
              <h2>{{ aktuell === 'neu' ? 'Neuer Artikel' : aktuell.bezeichnung }}</h2>
              <div class="felder">
                <ion-segment formControlName="typ">
                  @for (typ of typen; track typ) {
                    <ion-segment-button [value]="typ">{{ typ }}</ion-segment-button>
                  }
                </ion-segment>
                <ion-input
                  formControlName="bezeichnung"
                  label="Bezeichnung *"
                  labelPlacement="stacked"
                  fill="outline"
                />
                <ion-input
                  class="drittel"
                  formControlName="preis"
                  label="Nettopreis in € *"
                  labelPlacement="stacked"
                  fill="outline"
                  inputmode="decimal"
                />
                <ion-select
                  class="drittel"
                  formControlName="einheit"
                  label="Einheit *"
                  labelPlacement="stacked"
                  fill="outline"
                  interface="popover"
                >
                  @for (einheit of einheiten; track einheit) {
                    <ion-select-option [value]="einheit">{{ einheit }}</ion-select-option>
                  }
                </ion-select>
                <ion-select
                  class="drittel"
                  formControlName="mwstSatz"
                  label="MwSt *"
                  labelPlacement="stacked"
                  fill="outline"
                  interface="popover"
                >
                  @for (satz of mwstSaetze; track satz) {
                    <ion-select-option [value]="satz">{{ satz }} %</ion-select-option>
                  }
                </ion-select>
                @if (istArbeit()) {
                  <ion-checkbox
                    formControlName="istStundensatz"
                    labelPlacement="end"
                    justify="start"
                  >
                    Als Standard-Stundensatz für erfasste Arbeitszeiten verwenden
                  </ion-checkbox>
                }
              </div>
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
            <p class="leer">Artikel auswählen oder neu anlegen.</p>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class ArtikelPage {
  private readonly repo = inject(ARTIKEL_REPOSITORY);
  private readonly einstellungenRepo = inject(EINSTELLUNGEN_REPOSITORY);
  private readonly meldung = inject(Meldung);
  private readonly bestaetigung = inject(Bestaetigung);

  protected readonly typen = POSITIONSTYPEN;
  protected readonly einheiten = EINHEITEN;
  protected readonly mwstSaetze = MWST_SAETZE;
  protected readonly euro = formatiereEuro;

  readonly artikelListe = signal<readonly Artikel[]>([]);
  readonly suche = signal('');
  readonly typFilter = signal<TypFilter>('Alle');
  readonly auswahl = signal<Artikel | 'neu' | null>(null);
  readonly fehler = signal<readonly string[]>([]);
  readonly stundensatzId = signal<string | null>(null);

  protected readonly gewaehlteId = computed(() => {
    const aktuell = this.auswahl();
    return aktuell && aktuell !== 'neu' ? aktuell.id : null;
  });

  readonly form = new FormGroup({
    typ: new FormControl<PositionsTyp>('Material', { nonNullable: true }),
    bezeichnung: new FormControl('', { nonNullable: true, validators: [pflicht] }),
    preis: new FormControl('', { nonNullable: true, validators: [pflicht, euroNichtNegativ] }),
    einheit: new FormControl('Stk', { nonNullable: true, validators: [pflicht] }),
    mwstSatz: new FormControl(19, { nonNullable: true }),
    istStundensatz: new FormControl(false, { nonNullable: true }),
  });

  private readonly typ = toSignal(this.form.controls.typ.valueChanges, {
    initialValue: this.form.controls.typ.value,
  });
  readonly istArbeit = computed(() => this.typ() === 'Arbeit');

  readonly geladen: Promise<void> = this.laden();

  constructor() {
    // Beim Anlegen die übliche Einheit des Typs vorschlagen.
    this.form.controls.typ.valueChanges.subscribe((typ) => {
      if (this.auswahl() === 'neu' && this.form.controls.einheit.pristine) {
        this.form.controls.einheit.setValue(STANDARD_EINHEIT[typ]);
      }
    });
  }

  async laden(): Promise<void> {
    const filter = this.typFilter();
    const [artikel, einstellungen] = await Promise.all([
      this.repo.alle({ suche: this.suche(), typ: filter === 'Alle' ? null : filter }),
      this.einstellungenRepo.laden(),
    ]);
    this.artikelListe.set(artikel);
    this.stundensatzId.set(einstellungen.standardStundensatzArtikelId);
  }

  setzeSuche(suche: string): Promise<void> {
    this.suche.set(suche);
    return this.laden();
  }

  setzeTypFilter(wert: unknown): Promise<void> {
    this.typFilter.set(
      POSITIONSTYPEN.includes(wert as PositionsTyp) ? (wert as PositionsTyp) : 'Alle',
    );
    return this.laden();
  }

  neu(): void {
    const filter = this.typFilter();
    const typ = filter === 'Alle' ? LEERER_ARTIKEL.typ : filter;
    this.oeffne('neu', { ...LEERER_ARTIKEL, typ, einheit: STANDARD_EINHEIT[typ] });
  }

  waehle(artikel: Artikel): void {
    this.oeffne(artikel, artikel);
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
    const fehler = formularFehler(this.form, {
      bezeichnung: 'Bezeichnung',
      preis: 'Nettopreis',
      einheit: 'Einheit',
    });
    this.fehler.set(fehler);
    if (fehler.length > 0) {
      return false;
    }
    const w = this.form.getRawValue();
    const daten: ArtikelDaten = {
      typ: w.typ,
      bezeichnung: w.bezeichnung,
      einheit: w.einheit,
      nettopreisCent: parseEuro(w.preis) ?? 0,
      mwstSatz: Number(w.mwstSatz),
    };
    try {
      const gespeichert =
        aktuell === 'neu'
          ? await this.repo.anlegen(daten)
          : await this.repo.aendern(aktuell.id, daten);
      await this.speichereStundensatz(gespeichert, w.istStundensatz);
      await this.laden();
      this.oeffne(gespeichert, gespeichert);
      await this.meldung.erfolg('Artikel gespeichert');
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
      'Artikel löschen?',
      `„${aktuell.bezeichnung}" wird aus der Artikelliste entfernt. Bestehende Aufträge und Rechnungen bleiben unverändert.`,
      'Löschen',
    );
    if (!bestaetigt) {
      return;
    }
    try {
      await this.repo.loeschen(aktuell.id);
      this.abbrechen();
      await this.laden();
      await this.meldung.erfolg('Artikel gelöscht');
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
    }
  }

  private async speichereStundensatz(artikel: Artikel, gewaehlt: boolean): Promise<void> {
    const einstellungen = await this.einstellungenRepo.laden();
    const bisher = einstellungen.standardStundensatzArtikelId;
    const soll = gewaehlt && artikel.typ === 'Arbeit';
    const neu = soll ? artikel.id : bisher === artikel.id ? null : bisher;
    if (neu !== bisher) {
      await this.einstellungenRepo.speichern({
        ...einstellungen,
        standardStundensatzArtikelId: neu,
      });
    }
  }

  private oeffne(auswahl: Artikel | 'neu', daten: ArtikelDaten): void {
    this.auswahl.set(auswahl);
    this.form.reset({
      typ: daten.typ,
      bezeichnung: daten.bezeichnung,
      preis: auswahl === 'neu' ? '' : formatiereBetrag(daten.nettopreisCent),
      einheit: daten.einheit,
      mwstSatz: daten.mwstSatz,
      istStundensatz: auswahl !== 'neu' && auswahl.id === this.stundensatzId(),
    });
    this.fehler.set([]);
  }
}
