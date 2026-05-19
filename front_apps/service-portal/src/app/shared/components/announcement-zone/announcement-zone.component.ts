/**
 * Announcement Zone Component
 *
 * Renders a set of announcements in a portal zone (left / right / bottom).
 * - If rotationSeconds > 0: shows ONE announcement at a time, rotating.
 * - If rotationSeconds == 0: stacks ALL announcements.
 *
 * Each announcement renders according to its content_type:
 *   image | text | html
 * If the announcement has a cta_url, the whole card is clickable.
 */

import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AnnouncementData, AnnouncementSetData } from '../../../core/models/service-portal.model';

@Component({
  selector: 'app-announcement-zone',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './announcement-zone.component.html',
  styleUrls: ['./announcement-zone.component.scss'],
})
export class AnnouncementZoneComponent implements OnInit, OnDestroy {
  private sanitizer = inject(DomSanitizer);

  @Input() set data(value: AnnouncementSetData | null | undefined) {
    this._announcements.set(value?.announcements || []);
    this._currentIndex.set(0);
  }

  @Input() rotationSeconds = 0;

  /** Zone orientation: 'side' (left/right, vertical) or 'bottom' (horizontal strip) */
  @Input() orientation: 'side' | 'bottom' = 'side';

  private _announcements = signal<AnnouncementData[]>([]);
  private _currentIndex = signal<number>(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  protected announcements = this._announcements;
  protected currentIndex = computed(() => {
    const len = this._announcements().length;
    return len ? this._currentIndex() % len : 0;
  });

  protected hasAnnouncements = computed(() => this._announcements().length > 0);

  protected isRotating = computed(
    () => this.rotationSeconds > 0 && this._announcements().length > 1
  );

  /** Announcements actually shown: one (rotating) or all (stacked) */
  protected visibleAnnouncements = computed(() => {
    const list = this._announcements();
    if (this.isRotating()) {
      const idx = this._currentIndex() % list.length;
      return [list[idx]];
    }
    return list;
  });

  ngOnInit(): void {
    if (this.isRotating()) {
      this.timer = setInterval(() => {
        const list = this._announcements();
        if (list.length > 1) {
          this._currentIndex.update((i) => (i + 1) % list.length);
        }
      }, this.rotationSeconds * 1000);
    }
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  protected isClickable(a: AnnouncementData): boolean {
    return !!a.cta_url;
  }

  protected onClick(a: AnnouncementData): void {
    if (!a.cta_url) return;
    const target = a.cta_target || '_blank';
    if (target === '_self') {
      window.location.href = a.cta_url;
    } else {
      window.open(a.cta_url, '_blank', 'noopener,noreferrer');
    }
  }

  protected safeHtml(html: string | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html || '');
  }

  protected goTo(index: number): void {
    this._currentIndex.set(index);
  }
}
