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
import {
  IonButton,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
} from '@ionic/angular';
import { Artikel } from '../../core/domain/artikel';
import { Materialeintrag, summeMaterialCent } from '../../core/domain/erfassung';
import {
  formatiereBetrag,
  formatiereEuro,
  parseEuro,
  positionsbetragCent,
} from '../../core/domain/geld';
import { ARTIKEL_REPOSITORY } from '../../core/repositories/artikel.repository';
import { MATERIALEINTRAG_REPOSITORY } from '../../core/repositories/erfassung.repository';
import { Fehlerliste } from '../../shared/fehlerliste';
import { fehlerText } from '../../shared/meldung';
import {
  euroNichtNegativ,
  formatiereMenge,
  formularFehler,
  menge,
  parseMenge,
  pflicht,
} from '../../shared/validatoren';

const MAX_TREFFER = 6;

interface GewaehlterArtikel {
  readonly id: string;
  readonly bezeichnung: string;
  readonly einheit: string;
}

/** Material und Anfahrt eines Auftrags: Liste mit Summe und Formular zum Erfassen. */
@Component({
  selector: 'app-material-karte',
  imports: [
    ReactiveFormsModule,
    Fehlerliste,
    IonButton,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSearchbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="karte">
      <h2>Material und Anfahrt</h2>
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
              <h3>{{ eintrag.bezeichnung }}</h3>
              <p>
                {{ mengeText(eintrag.menge) }} {{ eintrag.einheit }} ×
                {{ euro(eintrag.einzelpreisCent) }} · {{ eintrag.typ }}
              </p>
            </ion-label>
            <ion-note slot="end" class="betrag">{{ euro(betrag(eintrag)) }}</ion-note>
          </ion-item>
        } @empty {
          <p class="hinweis">Noch kein Material erfasst.</p>
        }
      </ion-list>
      @if (eintraege().length > 0) {
        <p class="summe betrag">
          <strong>Summe netto: {{ summe() }}</strong>
        </p>
      }

      @if (!gesperrt()) {
        <app-fehlerliste [fehler]="fehler()" />
        @if (artikel(); as a) {
          <form [formGroup]="form" class="felder">
            <div class="gewaehlter-artikel">
              <strong>{{ a.bezeichnung }}</strong>
              @if (!bearbeitet()) {
                <ion-button fill="clear" size="small" (click)="artikel.set(null)">
                  Anderer Artikel
                </ion-button>
              }
            </div>
            <ion-input
              class="halb"
              formControlName="menge"
              [label]="'Menge (' + a.einheit + ') *'"
              labelPlacement="stacked"
              fill="outline"
              inputmode="decimal"
            />
            <ion-input
              class="halb"
              formControlName="preis"
              label="Einzelpreis netto in € *"
              labelPlacement="stacked"
              fill="outline"
              inputmode="decimal"
            />
          </form>
          <div class="aktionen">
            @if (bearbeitet()) {
              <ion-button class="loeschen" fill="clear" color="danger" (click)="loeschen()">
                Löschen
              </ion-button>
            }
            <span class="abstand"></span>
            <ion-button fill="outline" (click)="zuruecksetzen()">Abbrechen</ion-button>
            <ion-button class="hinzufuegen" (click)="speichern()">
              {{ bearbeitet() ? 'Übernehmen' : 'Hinzufügen' }}
            </ion-button>
          </div>
        } @else {
          <ion-searchbar
            placeholder="Artikel suchen und antippen …"
            [debounce]="200"
            (ionInput)="sucheArtikel($event.detail.value ?? '')"
          />
          <ion-list>
            @for (a of treffer(); track a.id) {
              <ion-item button [detail]="false" class="artikeltreffer" (click)="waehleArtikel(a)">
                <ion-label>
                  <h3>{{ a.bezeichnung }}</h3>
                  <p>{{ a.typ }}</p>
                </ion-label>
                <ion-note slot="end" class="betrag">
                  {{ euro(a.nettopreisCent) }} / {{ a.einheit }}
                </ion-note>
              </ion-item>
            } @empty {
              <p class="hinweis">
                Kein Artikel gefunden. Artikel werden unter „Artikel &amp; Leistungen" angelegt.
              </p>
            }
          </ion-list>
        }
      }
    </section>
  `,
})
export class MaterialKarte implements OnInit {
  private readonly repo = inject(MATERIALEINTRAG_REPOSITORY);
  private readonly artikelRepo = inject(ARTIKEL_REPOSITORY);

  readonly auftragId = input.required<string>();
  readonly gesperrt = input(false);

  readonly eintraege = signal<readonly Materialeintrag[]>([]);
  readonly bearbeitet = signal<Materialeintrag | null>(null);
  readonly artikel = signal<GewaehlterArtikel | null>(null);
  readonly treffer = signal<readonly Artikel[]>([]);
  readonly fehler = signal<readonly string[]>([]);
  protected readonly summe = computed(() => formatiereEuro(summeMaterialCent(this.eintraege())));

  protected readonly euro = formatiereEuro;
  protected readonly mengeText = formatiereMenge;
  protected readonly betrag = (e: Materialeintrag): number =>
    positionsbetragCent(e.menge, e.einzelpreisCent);

  readonly form = new FormGroup({
    menge: new FormControl('1', { nonNullable: true, validators: [pflicht, menge] }),
    preis: new FormControl('', { nonNullable: true, validators: [pflicht, euroNichtNegativ] }),
  });

  geladen: Promise<void> = Promise.resolve();

  ngOnInit(): void {
    this.geladen = Promise.all([this.laden(), this.sucheArtikel('')]).then(() => undefined);
  }

  async laden(): Promise<void> {
    this.eintraege.set(await this.repo.fuerAuftrag(this.auftragId()));
  }

  async sucheArtikel(suche: string): Promise<void> {
    this.treffer.set((await this.artikelRepo.alle({ suche })).slice(0, MAX_TREFFER));
  }

  /** Übernimmt den Artikelpreis als Vorschlag; er lässt sich für diesen Auftrag ändern. */
  waehleArtikel(artikel: Artikel): void {
    this.artikel.set(artikel);
    this.fehler.set([]);
    this.form.reset({ menge: '1', preis: formatiereBetrag(artikel.nettopreisCent) });
  }

  bearbeite(eintrag: Materialeintrag): void {
    if (this.gesperrt()) {
      return;
    }
    this.bearbeitet.set(eintrag);
    this.artikel.set({
      id: eintrag.artikelId,
      bezeichnung: eintrag.bezeichnung,
      einheit: eintrag.einheit,
    });
    this.fehler.set([]);
    this.form.reset({
      menge: formatiereMenge(eintrag.menge),
      preis: formatiereBetrag(eintrag.einzelpreisCent),
    });
  }

  zuruecksetzen(): void {
    this.bearbeitet.set(null);
    this.artikel.set(null);
    this.fehler.set([]);
  }

  async speichern(): Promise<boolean> {
    const artikel = this.artikel();
    if (!artikel) {
      return false;
    }
    const fehler = formularFehler(this.form, { menge: 'Menge', preis: 'Einzelpreis' });
    this.fehler.set(fehler);
    if (fehler.length > 0) {
      return false;
    }
    const w = this.form.getRawValue();
    const daten = {
      artikelId: artikel.id,
      menge: parseMenge(w.menge) ?? 0,
      einzelpreisCent: parseEuro(w.preis) ?? 0,
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
