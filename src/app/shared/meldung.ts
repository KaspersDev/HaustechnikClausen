import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

/** Kurze Rückmeldungen am unteren Bildschirmrand. */
@Injectable({ providedIn: 'root' })
export class Meldung {
  private readonly toasts = inject(ToastController);

  erfolg(text: string): Promise<void> {
    return this.zeigen(text, 'success');
  }

  fehler(text: string): Promise<void> {
    return this.zeigen(text, 'danger');
  }

  private async zeigen(text: string, farbe: string): Promise<void> {
    const toast = await this.toasts.create({
      message: text,
      color: farbe,
      duration: farbe === 'danger' ? 5000 : 2000,
      position: 'bottom',
    });
    await toast.present();
  }
}

export function fehlerText(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler);
}
