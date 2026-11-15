import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { NummernkreisTyp } from '../../core/domain/nummern';
import {
  EINSTELLUNGEN_REPOSITORY,
  FIRMENDATEN_REPOSITORY,
} from '../../core/repositories/firma.repository';
import { NUMMERNKREIS_REPOSITORY } from '../../core/repositories/nummernkreis.repository';
import { UHR } from '../../core/services/uhr';
import { Fehlerliste } from '../../shared/fehlerliste';
import { Meldung, fehlerText } from '../../shared/meldung';
import {
  email,
  formularFehler,
  ganzzahl,
  iban,
  pflicht,
  plz,
  ustId,
} from '../../shared/validatoren';

const MAX_LOGO_BYTES = 1024 * 1024;

const BEZEICHNUNGEN = {
  name: 'Firmenname',
  strasse: 'Straße',
  plz: 'PLZ',
  ort: 'Ort',
  email: 'E-Mail',
  ustId: 'USt-IdNr.',
  bankIban: 'IBAN',
  zahlungszielTage: 'Zahlungsziel',
  praefixRechnung: 'Präfix Rechnung',
  praefixAuftrag: 'Präfix Auftrag',
  naechsteRechnung: 'Nächste Rechnungsnummer',
  naechsterAuftrag: 'Nächste Auftragsnummer',
  textAufbewahrung: 'Hinweis Aufbewahrungspflicht',
  textArbeitskosten: 'Ausweis Arbeitskosten',
  textZahlung: 'Zahlungsbedingungen',
};

const text = (validatoren: ValidatorFn[] = []): FormControl<string> =>
  new FormControl('', { nonNullable: true, validators: validatoren });

@Component({
  selector: 'app-einstellungen-page',
  imports: [
    ReactiveFormsModule,
    Fehlerliste,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .logo-vorschau {
      border: 1px solid var(--ion-color-light-shade);
      border-radius: 8px;
      max-height: 96px;
      max-width: 240px;
      object-fit: contain;
      padding: 4px;
    }
    .logo-zeile {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Einstellungen</ion-title>
        <ion-buttons slot="end">
          <ion-button
            class="speichern"
            fill="solid"
            color="primary"
            [disabled]="speichert()"
            (click)="speichern()"
          >
            Speichern
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <app-fehlerliste [fehler]="fehler()" />
      <form [formGroup]="form" class="karten">
        <section class="karte">
          <h2>Firma</h2>
          <div class="felder">
            <ion-input
              formControlName="name"
              label="Firmenname *"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              formControlName="strasse"
              label="Straße und Hausnummer *"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              class="drittel"
              formControlName="plz"
              label="PLZ *"
              labelPlacement="stacked"
              fill="outline"
              inputmode="numeric"
            />
            <ion-input
              class="zweidrittel"
              formControlName="ort"
              label="Ort *"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              formControlName="land"
              label="Land"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              class="halb"
              formControlName="telefon"
              label="Telefon"
              labelPlacement="stacked"
              fill="outline"
              type="tel"
            />
            <ion-input
              class="halb"
              formControlName="email"
              label="E-Mail"
              labelPlacement="stacked"
              fill="outline"
              type="email"
            />
          </div>
        </section>

        <section class="karte">
          <h2>Steuer und Bank</h2>
          <div class="felder">
            <ion-input
              class="halb"
              formControlName="steuernummer"
              label="Steuernummer"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              class="halb"
              formControlName="ustId"
              label="USt-IdNr."
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              formControlName="bankInhaber"
              label="Kontoinhaber"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              formControlName="bankIban"
              label="IBAN"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              class="halb"
              formControlName="bankBic"
              label="BIC"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              class="halb"
              formControlName="bankName"
              label="Bank"
              labelPlacement="stacked"
              fill="outline"
            />
          </div>
          <p class="hinweis">Auf Rechnungen muss die Steuernummer oder die USt-IdNr. stehen.</p>
        </section>

        <section class="karte">
          <h2>Logo</h2>
          <div class="logo-zeile">
            @if (logo(); as bild) {
              <img class="logo-vorschau" [src]="bild" alt="Firmenlogo" />
            } @else {
              <span class="hinweis">Kein Logo hinterlegt.</span>
            }
            <ion-button fill="outline" (click)="datei.click()">Logo wählen</ion-button>
            @if (logo()) {
              <ion-button fill="clear" color="danger" (click)="logo.set(null)"
                >Entfernen</ion-button
              >
            }
            <input
              #datei
              type="file"
              accept="image/png,image/jpeg"
              hidden
              (change)="logoGewaehlt($event)"
            />
          </div>
          <p class="hinweis">PNG oder JPEG, höchstens 1 MB. Erscheint oben auf der Rechnung.</p>
        </section>

        <section class="karte">
          <h2>Rechnung und Nummern</h2>
          <div class="felder">
            <ion-input
              formControlName="zahlungszielTage"
              label="Zahlungsziel in Tagen *"
              labelPlacement="stacked"
              fill="outline"
              type="number"
              inputmode="numeric"
            />
            <ion-input
              class="halb"
              formControlName="praefixRechnung"
              label="Präfix Rechnung *"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              class="halb"
              formControlName="naechsteRechnung"
              [label]="'Nächste Nr. ' + jahr"
              labelPlacement="stacked"
              fill="outline"
              type="number"
              inputmode="numeric"
            />
            <ion-input
              class="halb"
              formControlName="praefixAuftrag"
              label="Präfix Auftrag *"
              labelPlacement="stacked"
              fill="outline"
            />
            <ion-input
              class="halb"
              formControlName="naechsterAuftrag"
              [label]="'Nächste Nr. ' + jahr"
              labelPlacement="stacked"
              fill="outline"
              type="number"
              inputmode="numeric"
            />
          </div>
          <p class="hinweis">
            Nummern haben die Form {{ form.controls.praefixRechnung.value }}-{{ jahr }}-0001 und
            beginnen jedes Jahr neu. Die nächste Nummer lässt sich nur ändern, solange im laufenden
            Jahr noch keine vergeben wurde.
          </p>
        </section>

        <section class="karte">
          <h2>Rechnungstexte</h2>
          <div class="felder">
            <ion-textarea
              formControlName="textAufbewahrung"
              label="Hinweis Aufbewahrungspflicht (nur Privatkunden) *"
              labelPlacement="stacked"
              fill="outline"
              [autoGrow]="true"
            />
            <ion-textarea
              formControlName="textArbeitskosten"
              label="Ausweis Arbeitskosten § 35a EStG (nur Privatkunden) *"
              labelPlacement="stacked"
              fill="outline"
              [autoGrow]="true"
            />
            <ion-textarea
              formControlName="textZahlung"
              label="Zahlungsbedingungen *"
              labelPlacement="stacked"
              fill="outline"
              [autoGrow]="true"
            />
            <ion-textarea
              formControlName="textSchluss"
              label="Schlusstext"
              labelPlacement="stacked"
              fill="outline"
              [autoGrow]="true"
            />
          </div>
          <p class="hinweis">
            Platzhalter: {{ '{arbeit}' }}, {{ '{anfahrt}' }}, {{ '{faelligAm}' }}, {{ '{nummer}' }}.
            Den Wortlaut bitte einmal vom Steuerberater bestätigen lassen.
          </p>
        </section>
      </form>
    </ion-content>
  `,
})
export class EinstellungenPage {
  private readonly firmaRepo = inject(FIRMENDATEN_REPOSITORY);
  private readonly einstellungenRepo = inject(EINSTELLUNGEN_REPOSITORY);
  private readonly nummernRepo = inject(NUMMERNKREIS_REPOSITORY);
  private readonly meldung = inject(Meldung);

  protected readonly jahr = inject(UHR).jetzt().getFullYear();
  protected readonly speichert = signal(false);
  readonly fehler = signal<readonly string[]>([]);
  readonly logo = signal<string | null>(null);

  private standardStundensatzArtikelId: string | null = null;
  private praefixAngebot = 'AN';

  readonly form = new FormGroup({
    name: text([pflicht]),
    strasse: text([pflicht]),
    plz: text([pflicht, plz('land')]),
    ort: text([pflicht]),
    land: text(),
    telefon: text(),
    email: text([email]),
    steuernummer: text(),
    ustId: text([ustId]),
    bankInhaber: text(),
    bankIban: text([iban]),
    bankBic: text(),
    bankName: text(),
    zahlungszielTage: new FormControl<number | string>(14, {
      nonNullable: true,
      validators: [pflicht, ganzzahl(0, 365)],
    }),
    praefixRechnung: text([pflicht]),
    praefixAuftrag: text([pflicht]),
    naechsteRechnung: new FormControl<number | string>(1, {
      nonNullable: true,
      validators: [pflicht, ganzzahl(1, 999999)],
    }),
    naechsterAuftrag: new FormControl<number | string>(1, {
      nonNullable: true,
      validators: [pflicht, ganzzahl(1, 999999)],
    }),
    textAufbewahrung: text([pflicht]),
    textArbeitskosten: text([pflicht]),
    textZahlung: text([pflicht]),
    textSchluss: text(),
  });

  /** Erfüllt, sobald die gespeicherten Werte im Formular stehen. */
  readonly geladen: Promise<void> = this.laden();

  async speichern(): Promise<boolean> {
    const fehler = formularFehler(this.form, BEZEICHNUNGEN);
    this.fehler.set(fehler);
    if (fehler.length > 0) {
      return false;
    }
    const w = this.form.getRawValue();
    this.speichert.set(true);
    try {
      await this.firmaRepo.speichern({
        name: w.name,
        strasse: w.strasse,
        plz: w.plz,
        ort: w.ort,
        land: w.land,
        telefon: w.telefon,
        email: w.email,
        steuernummer: w.steuernummer,
        ustId: w.ustId,
        bankInhaber: w.bankInhaber,
        bankIban: w.bankIban,
        bankBic: w.bankBic,
        bankName: w.bankName,
        logo: this.logo(),
      });
      await this.einstellungenRepo.speichern({
        zahlungszielTage: Number(w.zahlungszielTage),
        standardStundensatzArtikelId: this.standardStundensatzArtikelId,
        praefixRechnung: w.praefixRechnung.trim(),
        praefixAuftrag: w.praefixAuftrag.trim(),
        praefixAngebot: this.praefixAngebot,
        textAufbewahrung: w.textAufbewahrung,
        textArbeitskosten: w.textArbeitskosten,
        textZahlung: w.textZahlung,
        textSchluss: w.textSchluss,
      });
      await this.speichereStartwert('Rechnung', this.form.controls.naechsteRechnung);
      await this.speichereStartwert('Auftrag', this.form.controls.naechsterAuftrag);
      await this.meldung.erfolg('Einstellungen gespeichert');
      return true;
    } catch (fehler) {
      this.fehler.set([fehlerText(fehler)]);
      return false;
    } finally {
      this.speichert.set(false);
    }
  }

  protected logoGewaehlt(ereignis: Event): void {
    const eingabe = ereignis.target as HTMLInputElement;
    const datei = eingabe.files?.[0];
    eingabe.value = '';
    if (datei) {
      void this.uebernimmLogo(datei);
    }
  }

  async uebernimmLogo(datei: Blob): Promise<void> {
    if (!['image/png', 'image/jpeg'].includes(datei.type)) {
      this.fehler.set(['Logo: bitte eine PNG- oder JPEG-Datei wählen']);
      return;
    }
    if (datei.size > MAX_LOGO_BYTES) {
      this.fehler.set(['Logo: die Datei ist größer als 1 MB']);
      return;
    }
    this.logo.set(await alsDataUrl(datei));
    this.fehler.set([]);
  }

  private async laden(): Promise<void> {
    const [firma, einstellungen, rechnung, auftrag] = await Promise.all([
      this.firmaRepo.laden(),
      this.einstellungenRepo.laden(),
      this.nummernRepo.stand('Rechnung', this.jahr),
      this.nummernRepo.stand('Auftrag', this.jahr),
    ]);
    this.standardStundensatzArtikelId = einstellungen.standardStundensatzArtikelId;
    this.praefixAngebot = einstellungen.praefixAngebot;
    this.logo.set(firma.logo);
    this.form.patchValue({
      ...firma,
      ...einstellungen,
      naechsteRechnung: rechnung.naechsteNummer,
      naechsterAuftrag: auftrag.naechsteNummer,
    });
    for (const [stand, control] of [
      [rechnung, this.form.controls.naechsteRechnung],
      [auftrag, this.form.controls.naechsterAuftrag],
    ] as const) {
      if (stand.bereitsVergeben) {
        control.disable();
      } else {
        control.enable();
      }
    }
  }

  private async speichereStartwert(
    typ: NummernkreisTyp,
    control: FormControl<number | string>,
  ): Promise<void> {
    if (control.enabled && control.dirty) {
      await this.nummernRepo.setzeStartwert(typ, this.jahr, Number(control.value));
      control.markAsPristine();
    }
  }
}

function alsDataUrl(datei: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leser = new FileReader();
    leser.onload = () => resolve(String(leser.result));
    leser.onerror = () => reject(leser.error ?? new Error('Datei nicht lesbar'));
    leser.readAsDataURL(datei);
  });
}
