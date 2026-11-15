import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Zeigt Eingabefehler eines Formulars gesammelt und gut sichtbar an. */
@Component({
  selector: 'app-fehlerliste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (fehler().length > 0) {
      <div class="fehlerliste" role="alert">
        <strong>Bitte prüfen:</strong>
        <ul>
          @for (meldung of fehler(); track meldung) {
            <li>{{ meldung }}</li>
          }
        </ul>
      </div>
    }
  `,
})
export class Fehlerliste {
  readonly fehler = input.required<readonly string[]>();
}
