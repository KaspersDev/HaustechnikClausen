import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonButton, IonInput, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';
import { formatiereDatum, formatiereUhrzeit, tagVon, zeitpunktAus } from '../../core/domain/datum';
import {
  Zeiteintrag,
  dauerMinuten,
  formatiereDauer,
  summeMinuten,
} from '../../core/domain/erfassung';
import { ZEITEINTRAG_REPOSITORY } from '../../core/repositories/erfassung.repository';
import { UHR } from '../../core/services/uhr';
import { Fehlerliste } from '../../shared/fehlerliste';
import { fehlerText } from '../../shared/meldung';
import { formularFehler, ganzzahl, pflicht } from '../../shared/validatoren';

/** Arbeitszeiten eines Auftrags: Liste mit Summe und Formular zum Erfassen. */
@Component({
  selector: 'app-zeiten-karte',
  imports: [
    ReactiveFormsModule,
    Fehlerliste,
    IonButton,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="karte">
      <h2>Arbeitszeiten</h2>
      <ion-list>
        @for (eintrag of eintraege(); track eintrag.id) {
          <ion-item
            class="eintrag"
            [button]="!gesperrt()"
            [detail]="false"
            [class.gewaehlt]="eintrag.id === bearbeitet()?.id"
            (click)="bearbeite(eintrag)"
          >
            <ion-label>
              <h3>
                {{ datum(eintrag.start) }}, {{ uhrzeit(eintrag.start) }}–{{ uhrzeit(eintrag.ende) }}
              </h3>
              <p>
                {{ eintrag.taetigkeit || 'Ohne Tätigkeit' }}
                @if (eintrag.pauseMinuten > 0) {
                  · {{ eintrag.pauseMinuten }} min Pause
                }
              </p>
            </ion-label>
            <ion-note slot="end" class="betrag">{{ dauer(eintrag) }}</ion-note>
          </ion-item>
        } @empty {
          <p class="hinweis">Noch keine Zeiten erfasst.</p>
        }
      </ion-list>
      @if (eintraege().length > 0) {
        <p class="summe betrag">
          <strong>Summe: {{ summe() }}</strong>
        </p>
      }

      @if (!gesperrt()) {
        <app-fehlerliste [fehler]="fehler()" />
        <form [formGroup]="form" class="felder">
          <ion-input
            class="drittel"
            formControlName="tag"
            label="Datum *"
            labelPlacement="stacked"
            fill="outline"
            type="date"
          />
          <ion-input
            class="drittel"
            formControlName="von"
            label="Von *"
            labelPlacement="stacked"
            fill="outline"
            type="time"
          />
          <ion-input
            class="drittel"
            formControlName="bis"
            label="Bis *"
            labelPlacement="stacked"
            fill="outline"
            type="time"
          />
          <ion-input
            class="drittel"
            formControlName="pauseMinuten"
            label="Pause (min)"
            labelPlacement="stacked"
            fill="outline"
            type="number"
            inputmode="numeric"
          />
          <ion-input
            class="zweidrittel"
            formControlName="taetigkeit"
            label="Tätigkeit"
            labelPlacement="stacked"
            fill="outline"
          />
        </form>
        <div class="aktionen">
          @if (bearbeitet()) {
            <ion-button class="loeschen" fill="clear" color="danger" (click)="loeschen()">
              Löschen
            </ion-button>
            <span class="abstand"></span>
            <ion-button fill="outline" (click)="zuruecksetzen()">Abbrechen</ion-button>
          } @else {
            <span class="abstand"></span>
          }
          <ion-button class="hinzufuegen" (click)="speichern()">
            {{ bearbeitet() ? 'Übernehmen' : 'Zeit hinzufügen' }}
          </ion-button>
        </div>
      }
    </section>
  `,
})
export class ZeitenKarte implements OnInit {
  private readonly repo = inject(ZEITEINTRAG_REPOSITORY);
  private readonly uhr = inject(UHR);

  readonly auftragId = input.required<string>();
  readonly gesperrt = input(false);

  readonly eintraege = signal<readonly Zeiteintrag[]>([]);
  readonly bearbeitet = signal<Zeiteintrag | null>(null);
  readonly fehler = signal<readonly string[]>([]);
  protected readonly summe = computed(() => formatiereDauer(summeMinuten(this.eintraege())));

  protected readonly datum = formatiereDatum;
  protected readonly uhrzeit = formatiereUhrzeit;
  protected readonly dauer = (e: Zeiteintrag): string => formatiereDauer(dauerMinuten(e));

  readonly form = new FormGroup({
    tag: new FormControl('', { nonNullable: true, validators: [pflicht] }),
    von: new FormControl('', { nonNullable: true, validators: [pflicht] }),
    bis: new FormControl('', { nonNullable: true, validators: [pflicht] }),
    pauseMinuten: new FormControl<number | string>(0, {
      nonNullable: true,
      validators: [ganzzahl(0, 600)],
    }),
    taetigkeit: new FormControl('', { nonNullable: true }),
  });

  geladen: Promise<void> = Promise.resolve();

  ngOnInit(): void {
    this.zuruecksetzen();
    this.geladen = this.laden();
  }

  async laden(): Promise<void> {
    this.eintraege.set(await this.repo.fuerAuftrag(this.auftragId()));
  }

  bearbeite(eintrag: Zeiteintrag): void {
    if (this.gesperrt()) {
      return;
    }
    this.bearbeitet.set(eintrag);
    this.fehler.set([]);
    this.form.reset({
      tag: tagVon(new Date(eintrag.start)),
      von: formatiereUhrzeit(eintrag.start),
      bis: formatiereUhrzeit(eintrag.ende),
      pauseMinuten: eintrag.pauseMinuten,
      taetigkeit: eintrag.taetigkeit,
    });
  }

  zuruecksetzen(): void {
    this.bearbeitet.set(null);
    this.fehler.set([]);
    this.form.reset({
      tag: tagVon(this.uhr.jetzt()),
      von: '',
      bis: '',
      pauseMinuten: 0,
      taetigkeit: '',
    });
  }

  async speichern(): Promise<boolean> {
    const fehler = formularFehler(this.form, {
      tag: 'Datum',
      von: 'Von',
      bis: 'Bis',
      pauseMinuten: 'Pause',
    });
    this.fehler.set(fehler);
    if (fehler.length > 0) {
      return false;
    }
    const w = this.form.getRawValue();
    const daten = {
      start: zeitpunktAus(w.tag, w.von),
      ende: zeitpunktAus(w.tag, w.bis),
      pauseMinuten: Number(w.pauseMinuten || 0),
      taetigkeit: w.taetigkeit,
    };
    try {
      const vorhanden = this.bearbeitet();
      if (vorhanden) {
        await this.repo.aendern(vorhanden.id, daten);
      } else {
        await this.repo.anlegen(this.auftragId(), daten);
      }
      this.zuruecksetzen();
      await this.laden();
      return true;
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
      return false;
    }
  }

  async loeschen(): Promise<void> {
    const vorhanden = this.bearbeitet();
    if (!vorhanden) {
      return;
    }
    try {
      await this.repo.loeschen(vorhanden.id);
      this.zuruecksetzen();
      await this.laden();
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
    }
  }
}
