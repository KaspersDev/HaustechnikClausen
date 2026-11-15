import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
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
import { formatiereDatum } from '../../core/domain/datum';
import { formatiereEuro } from '../../core/domain/geld';
import { kundenname } from '../../core/domain/kunde';
import {
  RECHNUNG_STATUS,
  RechnungKopf,
  RechnungStatus,
  rechnungsart,
} from '../../core/domain/rechnung';
import { RECHNUNG_REPOSITORY } from '../../core/repositories/rechnung.repository';

type StatusFilter = RechnungStatus | 'Alle';

@Component({
  selector: 'app-rechnungen-page',
  imports: [
    IonContent,
    IonHeader,
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
  styles: `
    .filter {
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(260px, 380px) 1fr;
      padding: 8px 12px;
    }
    .status {
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
      margin-left: 8px;
      padding: 2px 10px;
    }
    .status-Entwurf {
      background: #e0e0e0;
    }
    .status-Versendet {
      background: #fff0c2;
    }
    .status-Bezahlt {
      background: #c8ebd0;
    }
    .status-Storniert {
      background: #f6cfd0;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Rechnungen</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="filter">
        <ion-searchbar
          placeholder="Nummer, Kunde …"
          [debounce]="200"
          [value]="suche()"
          (ionInput)="setzeSuche($event.detail.value ?? '')"
        />
        <ion-segment [value]="statusFilter()" (ionChange)="setzeStatus($event.detail.value)">
          <ion-segment-button value="Alle">Alle</ion-segment-button>
          @for (status of statusListe; track status) {
            <ion-segment-button [value]="status">{{ status }}</ion-segment-button>
          }
        </ion-segment>
      </div>
      <ion-list>
        @for (r of rechnungen(); track r.id) {
          <ion-item button [detail]="true" class="rechnung" (click)="oeffne(r)">
            <ion-label>
              <h2>
                {{ r.nummer ?? 'Entwurf' }}
                @if (r.stornoVonRechnungId) {
                  · Stornorechnung
                }
                <span class="status" [class]="'status status-' + r.status">{{ r.status }}</span>
              </h2>
              <p>
                {{ name(r.empfaenger) }} · {{ datum(r.datum) }} · fällig {{ datum(r.faelligAm) }}
              </p>
            </ion-label>
            <ion-note slot="end" class="betrag">{{ euro(r.summeBruttoCent) }}</ion-note>
          </ion-item>
        } @empty {
          <p class="leer">
            {{
              suche() || statusFilter() !== 'Alle'
                ? 'Keine Rechnungen gefunden.'
                : 'Noch keine Rechnungen. Rechnungen entstehen aus erledigten Aufträgen.'
            }}
          </p>
        }
      </ion-list>
    </ion-content>
  `,
})
export class RechnungenPage {
  private readonly repo = inject(RECHNUNG_REPOSITORY);
  private readonly router = inject(Router);

  protected readonly statusListe = RECHNUNG_STATUS;
  protected readonly euro = formatiereEuro;
  protected readonly datum = formatiereDatum;
  protected readonly name = kundenname;
  protected readonly art = rechnungsart;

  readonly rechnungen = signal<readonly RechnungKopf[]>([]);
  readonly suche = signal('');
  readonly statusFilter = signal<StatusFilter>('Alle');
  readonly geladen: Promise<void> = this.laden();

  /** Ionic ruft dies bei jeder Rückkehr auf die Seite auf. */
  ionViewWillEnter(): void {
    void this.laden();
  }

  async laden(): Promise<void> {
    const status = this.statusFilter();
    this.rechnungen.set(
      await this.repo.alle({ suche: this.suche(), status: status === 'Alle' ? null : status }),
    );
  }

  setzeSuche(suche: string): Promise<void> {
    this.suche.set(suche);
    return this.laden();
  }

  setzeStatus(wert: unknown): Promise<void> {
    this.statusFilter.set(RECHNUNG_STATUS.find((s) => s === wert) ?? 'Alle');
    return this.laden();
  }

  oeffne(rechnung: RechnungKopf): void {
    void this.router.navigate(['/rechnungen', rechnung.id]);
  }
}
