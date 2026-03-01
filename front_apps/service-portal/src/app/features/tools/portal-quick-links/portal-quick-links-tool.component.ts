/**
 * Portal Quick Links Tool Component
 *
 * Displays a grid of configurable quick links with icons or images.
 */

import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { PortalQuickLinksData, PortalQuickLinkItem, ServicePortalTool } from '../../../core/models/service-portal.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-portal-quick-links-tool',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './portal-quick-links-tool.component.html',
  styleUrls: ['./portal-quick-links-tool.component.scss']
})
export class PortalQuickLinksToolComponent implements OnInit {
  private stateService = inject(StateService);
  private router = inject(Router);

  protected quickLinksData = signal<PortalQuickLinksData | null>(null);
  protected error = signal<string | null>(null);

  protected sortedLinks = computed(() => {
    const data = this.quickLinksData();
    if (!data?.links) return [];
    return [...data.links]
      .filter(link => link.is_enabled)
      .sort((a, b) => a.display_order - b.display_order);
  });

  ngOnInit(): void {
    const portal = this.stateService.selectedPortal();
    if (!portal) {
      this.error.set('No se pudo cargar el portal.');
      return;
    }

    // Find the portal_quick_links tool to get the inline data
    const tool = portal.tools.find((t: ServicePortalTool) => t.tool_type === 'portal_quick_links');
    if (!tool?.quick_links_data) {
      this.error.set('No se encontraron enlaces rápidos configurados.');
      return;
    }

    this.quickLinksData.set(tool.quick_links_data);
  }

  protected openLink(link: PortalQuickLinkItem): void {
    window.open(link.url, link.target);
  }

  protected goBack(): void {
    const portal = this.stateService.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    }
  }
}
