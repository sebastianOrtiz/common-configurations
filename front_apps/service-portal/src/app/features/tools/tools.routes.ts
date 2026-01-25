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
    loadComponent: () => import('./meet-scheduling/meet-scheduling-tool.component').then(m => m.MeetSchedulingToolComponent)
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
    loadComponent: () => import('./tool-not-found/tool-not-found.component').then(m => m.ToolNotFoundComponent)
  }
];
