import { Injectable, InjectionToken, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { baueRechnungsdokument } from '../domain/rechnungsdokument';
import { EINSTELLUNGEN_REPOSITORY, FIRMENDATEN_REPOSITORY } from '../repositories/firma.repository';
import { RECHNUNG_REPOSITORY } from '../repositories/rechnung.repository';
import { pdfDefinition } from './pdf-definition';

export interface PdfDatei {
  readonly dateiname: string;
  /** Inhalt der PDF-Datei, Base64-kodiert. */
  readonly base64: string;
}

/** Übergibt eine fertige Datei an den Benutzer (Teilen-Dialog bzw. Download). */
export interface Dateiausgabe {
  ausgeben(datei: PdfDatei, mimeTyp?: string): Promise<void>;
}

export const DATEIAUSGABE = new InjectionToken<Dateiausgabe>('DATEIAUSGABE', {
  providedIn: 'root',
  factory: () => (Capacitor.isNativePlatform() ? geraeteAusgabe : browserAusgabe),
});

/** Auf dem Tablet: Datei ablegen und den Android-Dialog „Teilen" öffnen (Drucken, Mail, Speichern). */
const geraeteAusgabe: Dateiausgabe = {
  async ausgeben(datei) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: `ausgabe/${datei.dateiname}`,
      data: datei.base64,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: datei.dateiname, files: [uri] });
  },
};

/** Im Browser: Datei herunterladen. */
const browserAusgabe: Dateiausgabe = {
  async ausgeben(datei, mimeTyp = 'application/pdf') {
    const bytes = Uint8Array.from(atob(datei.base64), (zeichen) => zeichen.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeTyp }));
    const link = document.createElement('a');
    link.href = url;
    link.download = datei.dateiname;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

/** Erzeugt Rechnungs-PDFs vollständig auf dem Gerät (ohne Netz). */
@Injectable({ providedIn: 'root' })
export class PdfService {
  private readonly rechnungen = inject(RECHNUNG_REPOSITORY);
  private readonly firma = inject(FIRMENDATEN_REPOSITORY);
  private readonly einstellungen = inject(EINSTELLUNGEN_REPOSITORY);
  private readonly ausgabe = inject(DATEIAUSGABE);

  async erzeuge(rechnungId: string): Promise<PdfDatei> {
    const rechnung = await this.rechnungen.finde(rechnungId);
    if (!rechnung) {
      throw new Error('Die Rechnung wurde nicht gefunden.');
    }
    const original = rechnung.stornoVonRechnungId
      ? await this.rechnungen.finde(rechnung.stornoVonRechnungId)
      : null;
    const dokument = baueRechnungsdokument(
      rechnung,
      await this.firma.laden(),
      await this.einstellungen.laden(),
      original,
    );

    // pdfmake und die Schriften werden erst hier geladen (eigener Chunk).
    const [pdfMake, schriften] = await Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts'),
    ]);
    const bibliothek = 'default' in pdfMake ? pdfMake.default : pdfMake;
    bibliothek.addVirtualFileSystem('default' in schriften ? schriften.default : schriften);
    const base64 = await bibliothek.createPdf(pdfDefinition(dokument)).getBase64();
    return { dateiname: dokument.dateiname, base64 };
  }

  /** Erzeugt das PDF und übergibt es an Teilen-Dialog bzw. Download. */
  async oeffne(rechnungId: string): Promise<void> {
    await this.ausgabe.ausgeben(await this.erzeuge(rechnungId));
  }
}
