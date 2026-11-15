import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';

/** Sicherheitsabfrage vor nicht umkehrbaren Aktionen. */
@Injectable({ providedIn: 'root' })
export class Bestaetigung {
  private readonly alerts = inject(AlertController);

  async frage(titel: string, text: string, bestaetigen = 'Ja'): Promise<boolean> {
    const alert = await this.alerts.create({
      header: titel,
      message: text,
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: bestaetigen, role: 'confirm' },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'confirm';
  }
}
