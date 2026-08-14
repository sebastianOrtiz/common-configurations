/**
 * Attachment Uploader Component
 *
 * Reusable multi-file uploader for the radicación flows (procedures,
 * create-logbook). Lets the citizen attach evidence (PDF/JPG/PNG) before
 * submitting a request:
 *
 *  - Uploads each selected file individually via
 *    `logbook.api.entries.upload_portal_attachment` (multipart FormData).
 *  - Emits the list of successfully uploaded attachments through
 *    `attachmentsChange`, ready to be serialized into the `documents` arg.
 *  - Emits `uploadingChange` so the parent form can disable submission
 *    while any file is still in flight.
 *
 * The auth token is attached automatically by `userContactTokenInterceptor`
 * (same-origin requests), so this component only needs a plain HttpClient
 * POST — no manual Content-Type (the browser must set the multipart
 * boundary) and no manual auth header.
 */

import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { IconComponent } from '../icon/icon.component';

export interface UploadedAttachment {
  file_url: string;
  file_name: string;
}

interface AttachmentItem {
  id: string;
  file_name: string;
  file_url?: string;
  status: 'uploading' | 'done' | 'error';
  errorMessage?: string;
}

const UPLOAD_ATTACHMENT_URL = '/api/method/logbook.api.entries.upload_portal_attachment';

@Component({
  selector: 'app-attachment-uploader',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './attachment-uploader.component.html',
  styleUrls: ['./attachment-uploader.component.scss'],
})
export class AttachmentUploaderComponent {
  private http = inject(HttpClient);

  @Input() accept: string = '.pdf,.jpg,.jpeg,.png';
  @Input() maxFileSizeMB: number = 5;
  @Input() disabled: boolean = false;

  /** Emits the current list of successfully uploaded attachments. */
  @Output() attachmentsChange = new EventEmitter<UploadedAttachment[]>();
  /** Emits true while at least one file is still uploading. */
  @Output() uploadingChange = new EventEmitter<boolean>();

  protected items = signal<AttachmentItem[]>([]);
  protected uploadError = signal<string | null>(null);

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => this.handleFile(file));

    // Reset so selecting the exact same file again still fires 'change'
    input.value = '';
  }

  private handleFile(file: File): void {
    const validationError = this.validateFile(file);
    if (validationError) {
      this.uploadError.set(validationError);
      return;
    }

    this.uploadError.set(null);

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: AttachmentItem = { id, file_name: file.name, status: 'uploading' };
    this.items.update((current) => [...current, item]);
    this.emitUploadingState();

    const formData = new FormData();
    formData.append('file', file, file.name);

    this.http
      .post<{ message: { file_url: string; file_name: string } }>(UPLOAD_ATTACHMENT_URL, formData)
      .subscribe({
        next: (response) => {
          const result = response?.message;
          this.items.update((current) =>
            current.map((it) =>
              it.id === id
                ? {
                    ...it,
                    status: 'done',
                    file_url: result?.file_url,
                    file_name: result?.file_name || it.file_name,
                  }
                : it
            )
          );
          this.emitAttachments();
          this.emitUploadingState();
        },
        error: (err) => {
          console.error('Error uploading attachment:', err);
          this.items.update((current) =>
            current.map((it) =>
              it.id === id ? { ...it, status: 'error', errorMessage: 'No se pudo subir el archivo' } : it
            )
          );
          this.uploadError.set(`No se pudo subir "${file.name}". Intenta de nuevo.`);
          this.emitUploadingState();
        },
      });
  }

  private validateFile(file: File): string | null {
    const allowedExt = this.accept
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (allowedExt.length && !allowedExt.includes(ext)) {
      return `Tipo de archivo no permitido: ${file.name}. Formatos aceptados: ${this.accept}`;
    }

    const maxBytes = this.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      return `"${file.name}" supera el tamaño máximo de ${this.maxFileSizeMB}MB`;
    }

    return null;
  }

  protected removeItem(id: string): void {
    this.items.update((current) => current.filter((it) => it.id !== id));
    this.emitAttachments();
    this.emitUploadingState();
  }

  private emitAttachments(): void {
    const done: UploadedAttachment[] = this.items()
      .filter((it): it is AttachmentItem & { file_url: string } => it.status === 'done' && !!it.file_url)
      .map((it) => ({ file_url: it.file_url, file_name: it.file_name }));
    this.attachmentsChange.emit(done);
  }

  private emitUploadingState(): void {
    this.uploadingChange.emit(this.items().some((it) => it.status === 'uploading'));
  }

  /** Clear all attachments. Intended to be called by the parent (via @ViewChild) after a successful submit. */
  reset(): void {
    this.items.set([]);
    this.uploadError.set(null);
    this.attachmentsChange.emit([]);
    this.uploadingChange.emit(false);
  }
}
