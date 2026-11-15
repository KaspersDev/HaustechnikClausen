import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuftragMitKunde, STATUS_TITEL } from '../../core/domain/auftrag';
import { AUFTRAG_REPOSITORY } from '../../core/repositories/auftrag.repository';

@Component({
  selector: 'app-auftraege-page',
  imports: [
    RouterLink,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Aufträge</ion-title>
        <ion-buttons slot="end">
          <ion-button class="neu" fill="solid" color="primary" routerLink="/auftraege/neu">
            Neuer Auftrag
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        @for (auftrag of auftraege(); track auftrag.id) {
          <ion-item button [detail]="true" [routerLink]="['/auftraege', auftrag.id]">
            <ion-label>
              <h2>{{ auftrag.nummer }} · {{ auftrag.titel }}</h2>
              <p>{{ auftrag.kundeName }}</p>
            </ion-label>
            <ion-note slot="end">{{ statusTitel[auftrag.status] }}</ion-note>
          </ion-item>
        } @empty {
          <p class="leer">Noch keine Aufträge angelegt.</p>
        }
      </ion-list>
    </ion-content>
  `,
})
export class AuftraegePage {
  private readonly repo = inject(AUFTRAG_REPOSITORY);
  protected readonly statusTitel = STATUS_TITEL;
  readonly auftraege = signal<readonly AuftragMitKunde[]>([]);
  readonly geladen: Promise<void> = this.laden();

  /** Ionic ruft dies bei jeder Rückkehr auf die Seite auf. */
  ionViewWillEnter(): void {
    void this.laden();
  }

  async laden(): Promise<void> {
    this.auftraege.set(await this.repo.alle());
  }
}
