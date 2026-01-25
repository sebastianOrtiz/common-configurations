/**
 * Tools Routes
 *
 * Lazy-loaded routes for different tool types
 * Each tool is loaded on-demand as a separate chunk
 */

import { Routes } from '@angular/router';

export const toolRoutes: Routes = [
  // Meet Scheduling Tool
  {
    path: 'meet_scheduling',
    loadComponent: () => {
      console.log('[ToolRoutes] Loading meet_scheduling component');
      return import('./meet-scheduling/meet-scheduling-tool.component').then(m => {
        console.log('[ToolRoutes] meet_scheduling component loaded:', m);
        return m.MeetSchedulingToolComponent;
      });
    }
  },

  // Future tools can be added here
  // Example:
  // {
  //   path: 'document_viewer',
  //   loadComponent: () => import('./document-viewer/document-viewer-tool.component').then(m => m.DocumentViewerToolComponent)
  // },

  // Fallback for unknown tool types
  {
    path: '**',
    loadComponent: () => {
      console.log('[ToolRoutes] Loading tool-not-found (fallback)');
      return import('./tool-not-found/tool-not-found.component').then(m => m.ToolNotFoundComponent);
    }
  }
];
