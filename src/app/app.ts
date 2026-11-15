import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonRouterOutlet,
  IonSplitPane,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  clipboardOutline,
  documentTextOutline,
  peopleOutline,
  pricetagsOutline,
  settingsOutline,
} from 'ionicons/icons';
import { NAVIGATION } from './navigation';

@Component({
  selector: 'app-root',
  imports: [
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenu,
    IonRouterOutlet,
    IonSplitPane,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  template: `
    <ion-app>
      <ion-split-pane contentId="hauptinhalt" when="(min-width: 700px)">
        <ion-menu contentId="hauptinhalt" class="hauptmenue">
          <ion-header>
            <ion-toolbar>
              <ion-title>Haustechnik Clausen</ion-title>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            <ion-list lines="none">
              @for (eintrag of navigation; track eintrag.pfad) {
                <ion-item
                  class="nav-eintrag"
                  [routerLink]="eintrag.pfad"
                  routerLinkActive="aktiv"
                  routerDirection="root"
                  [detail]="false"
                  button
                >
                  <ion-icon slot="start" [name]="eintrag.icon" aria-hidden="true"></ion-icon>
                  <ion-label>{{ eintrag.titel }}</ion-label>
                </ion-item>
              }
            </ion-list>
          </ion-content>
        </ion-menu>
        <ion-router-outlet id="hauptinhalt"></ion-router-outlet>
      </ion-split-pane>
    </ion-app>
  `,
})
export class App {
  protected readonly navigation = NAVIGATION;

  constructor() {
    addIcons({
      clipboardOutline,
      documentTextOutline,
      peopleOutline,
      pricetagsOutline,
      settingsOutline,
    });
  }
}
