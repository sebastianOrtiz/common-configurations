/**
 * Tenant Hub — Group List
 *
 * Public landing of the Tenant Hub: shows all active Tenant Portal Groups
 * as cards. Clicking a card navigates to /hub/:slug.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HubService } from '../hub.service';
import { TenantPortalGroup } from '../hub.types';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-tenant-hub-list',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './tenant-hub-list.component.html',
  styleUrls: ['./tenant-hub-list.component.scss'],
})
export class TenantHubListComponent implements OnInit {
  private hubService = inject(HubService);
  private router = inject(Router);

  protected loading = signal<boolean>(true);
  protected error = signal<string | null>(null);
  protected groups = signal<TenantPortalGroup[]>([]);

  ngOnInit(): void {
    this.loadGroups();
  }

  retry(): void {
    this.loadGroups();
  }

  protected openGroup(group: TenantPortalGroup): void {
    this.router.navigate(['/hub', group.slug]);
  }

  private loadGroups(): void {
    this.loading.set(true);
    this.error.set(null);
    this.hubService.getGroups().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading hub groups:', err);
        this.error.set(
          'No se pudieron cargar las categorías. Inténtalo de nuevo.',
        );
        this.loading.set(false);
      },
    });
  }
}
