import { Routes } from '@angular/router';

export const routes: Routes = [
  // Default route - redirect to portals
  {
    path: '',
    redirectTo: '/portals',
    pathMatch: 'full'
  },

  // Portal selector (public - no authentication required)
  {
    path: 'portals',
    loadComponent: () => import('./features/portal/portal-selector/portal-selector.component').then(m => m.PortalSelectorComponent)
  },

  // Portal view and tools (public - no authentication required)
  {
    path: 'portal/:portalName',
    loadComponent: () => import('./features/portal/portal-layout/portal-layout.component').then(m => m.PortalLayoutComponent),
    children: [
      // Portal main view
      {
        path: '',
        loadComponent: () => import('./features/portal/portal-view/portal-view.component').then(m => m.PortalViewComponent)
      },

      // Contact registration (always required before accessing tools)
      {
        path: 'register',
        loadComponent: () => import('./features/portal/contact-registration/contact-registration.component').then(m => m.ContactRegistrationComponent)
      },

      // Tool routes (lazy loaded by tool type)
      {
        path: 'tool/:toolType',
        loadChildren: () => import('./features/tools/tools.routes').then(m => m.toolRoutes)
      }
    ]
  },

  // Legacy login route - redirect to portals (login no longer required)
  {
    path: 'login',
    redirectTo: '/portals',
    pathMatch: 'full'
  },

  // Catch-all route - redirect to portals
  {
    path: '**',
    redirectTo: '/portals'
  }
];
