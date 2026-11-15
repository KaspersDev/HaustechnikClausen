import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import {
  AUFTRAG_STATUS,
  AuftragMitKunde,
  AuftragStatus,
  STATUS_TITEL,
  istStatuswechselErlaubt,
} from '../../core/domain/auftrag';
import { formatiereDatum } from '../../core/domain/datum';
import { adresszeile } from '../../core/domain/kunde';
import { AUFTRAG_REPOSITORY } from '../../core/repositories/auftrag.repository';
import { RechnungAusAuftragService } from '../../core/services/rechnung-aus-auftrag.service';
import { Bestaetigung } from '../../shared/bestaetigung';
import { Meldung, fehlerText } from '../../shared/meldung';

/** Der für das Board nötige Ausschnitt eines CDK-Drop-Ereignisses. */
export type BoardDrop = Pick<
  CdkDragDrop<AuftragStatus, AuftragStatus, AuftragMitKunde>,
  'currentIndex'
> & {
  readonly item: { readonly data: AuftragMitKunde };
  readonly container: { readonly data: AuftragStatus };
};

type Spalten = Record<AuftragStatus, readonly AuftragMitKunde[]>;

const LEERE_SPALTEN: Spalten = { Offen: [], InArbeit: [], Erledigt: [], Abgerechnet: [] };

/** Auftrags-Board: Kanban mit Drag & Drop zwischen den Status-Spalten. */
@Component({
  selector: 'app-auftraege-page',
  imports: [
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    RouterLink,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonSearchbar,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auftraege.page.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Aufträge</ion-title>
        <ion-searchbar
          slot="end"
          class="board-suche"
          placeholder="Nummer, Titel, Kunde, Ort …"
          [debounce]="200"
          [value]="suche()"
          (ionInput)="setzeSuche($event.detail.value ?? '')"
        />
        <ion-buttons slot="end">
          <ion-button class="neu" fill="solid" color="primary" routerLink="/auftraege/neu">
            Neuer Auftrag
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content [scrollY]="false">
      <div class="board" cdkDropListGroup>
        @for (status of statusListe; track status) {
          <section class="spalte" [attr.data-status]="status">
            <header>
              <h2>{{ titel[status] }}</h2>
              <span class="anzahl">{{ spalten()[status].length }}</span>
            </header>
            <div
              class="karten-liste"
              cdkDropList
              [cdkDropListData]="status"
              [cdkDropListSortingDisabled]="status === 'Abgerechnet'"
              (cdkDropListDropped)="abgelegt($event)"
            >
              @for (auftrag of spalten()[status]; track auftrag.id) {
                <article
                  class="auftragskarte"
                  cdkDrag
                  [cdkDragData]="auftrag"
                  [cdkDragDisabled]="status === 'Abgerechnet' || suche() !== ''"
                  [cdkDragStartDelay]="{ touch: 150, mouse: 0 }"
                  [attr.data-nummer]="auftrag.nummer"
                  tabindex="0"
                  role="button"
                  (click)="oeffne(auftrag)"
                  (keydown.enter)="oeffne(auftrag)"
                >
                  <div class="nummer">{{ auftrag.nummer }}</div>
                  <h3>{{ auftrag.titel }}</h3>
                  <p class="kunde">{{ auftrag.kundeName }}</p>
                  @if (ort(auftrag); as o) {
                    <p>{{ o }}</p>
                  }
                  @if (auftrag.status === 'Erledigt' || auftrag.status === 'Abgerechnet') {
                    <p class="termin">Erledigt {{ datum(auftrag.erledigtAm) }}</p>
                  } @else if (auftrag.geplantAm) {
                    <p class="termin">Geplant {{ datum(auftrag.geplantAm) }}</p>
                  }
                </article>
              } @empty {
                <p class="leer">
                  {{
                    status === 'Abgerechnet' ? 'Entsteht durch eine Rechnung.' : 'Keine Aufträge.'
                  }}
                </p>
              }
            </div>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class AuftraegePage {
  private readonly repo = inject(AUFTRAG_REPOSITORY);
  private readonly router = inject(Router);
  private readonly meldung = inject(Meldung);
  private readonly bestaetigung = inject(Bestaetigung);
  private readonly rechnungAusAuftrag = inject(RechnungAusAuftragService);

  protected readonly statusListe = AUFTRAG_STATUS;
  protected readonly titel = STATUS_TITEL;
  protected readonly datum = formatiereDatum;
  protected readonly ort = (a: AuftragMitKunde): string => adresszeile(a.einsatzort);

  readonly suche = signal('');
  private readonly auftraege = signal<readonly AuftragMitKunde[]>([]);
  readonly spalten = computed<Spalten>(() => {
    const spalten: Record<AuftragStatus, AuftragMitKunde[]> = {
      Offen: [],
      InArbeit: [],
      Erledigt: [],
      Abgerechnet: [],
    };
    for (const auftrag of this.auftraege()) {
      spalten[auftrag.status].push(auftrag);
    }
    return this.auftraege().length === 0 ? LEERE_SPALTEN : spalten;
  });

  readonly geladen: Promise<void> = this.laden();

  /** Ionic ruft dies bei jeder Rückkehr auf die Seite auf. */
  ionViewWillEnter(): void {
    void this.laden();
  }

  async laden(): Promise<void> {
    this.auftraege.set(await this.repo.alle(this.suche()));
  }

  setzeSuche(suche: string): Promise<void> {
    this.suche.set(suche);
    return this.laden();
  }

  oeffne(auftrag: AuftragMitKunde): void {
    void this.router.navigate(['/auftraege', auftrag.id]);
  }

  /** Karte wurde losgelassen: Status und Position dauerhaft übernehmen. */
  async abgelegt(ereignis: BoardDrop): Promise<void> {
    const auftrag = ereignis.item.data;
    const ziel = ereignis.container.data;

    if (ziel === 'Abgerechnet' || !istStatuswechselErlaubt(auftrag.status, ziel)) {
      if (auftrag.status === 'Erledigt') {
        await this.rechnungAnbieten(auftrag);
      } else if (auftrag.status !== 'Abgerechnet') {
        await this.meldung.fehler(
          'Nur erledigte Aufträge können abgerechnet werden. Den Auftrag zuerst nach „Erledigt" ziehen.',
        );
      }
      return;
    }

    // Sofort anzeigen, dann speichern; bei einem Fehler den gespeicherten Stand neu laden.
    this.auftraege.update((alle) => verschoben(alle, auftrag, ziel, ereignis.currentIndex));
    try {
      await this.repo.verschiebe(auftrag.id, ziel, ereignis.currentIndex);
    } catch (fehler) {
      await this.meldung.fehler(fehlerText(fehler));
    }
    await this.laden();
  }

  /** „Abgerechnet" entsteht nur durch eine Rechnung – deshalb wird sie hier angeboten. */
  private async rechnungAnbieten(auftrag: AuftragMitKunde): Promise<void> {
    const bestaetigt = await this.bestaetigung.frage(
      'Rechnung erzeugen?',
      `Abgerechnet wird ${auftrag.nummer} durch seine Rechnung. Jetzt einen Rechnungsentwurf mit Zeiten und Material anlegen?`,
      'Rechnung erzeugen',
    );
    if (!bestaetigt) {
      return;
    }
    try {
      const rechnung = await this.rechnungAusAuftrag.erzeuge(auftrag.id);
      await this.router.navigate(['/rechnungen', rechnung.id]);
    } catch (fehler) {
      await this.meldung.fehler(fehlerText(fehler));
    }
  }
}

function verschoben(
  alle: readonly AuftragMitKunde[],
  auftrag: AuftragMitKunde,
  ziel: AuftragStatus,
  index: number,
): AuftragMitKunde[] {
  const rest = alle.filter((a) => a.id !== auftrag.id);
  const zielspalte = rest.filter((a) => a.status === ziel);
  zielspalte.splice(index, 0, { ...auftrag, status: ziel });
  return [...rest.filter((a) => a.status !== ziel), ...zielspalte];
}
