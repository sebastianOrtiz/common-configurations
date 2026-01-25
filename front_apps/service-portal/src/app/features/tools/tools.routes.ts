/**
 * Tools Routes
 *
 * Lazy-loaded routes for different tool types
 * Each tool is loaded on-demand as a separate chunk
 *
 * NOTE: These are child routes of 'tool/:toolType'
 * The toolType parameter is already consumed by the parent route
 * So we need to use a tool router component to handle the dynamic loading
 */

import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

export const toolRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tool-router/tool-router.component').then(m => m.ToolRouterComponent)
  }
];
