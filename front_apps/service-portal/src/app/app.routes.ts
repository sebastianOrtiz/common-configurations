import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Default route - redirect to portals
  {
    path: '',
    redirectTo: '/portals',
    pathMatch: 'full'
  },

  // Login route (public)
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },

  // Portal selector (protected)
  {
    path: 'portals',
    canActivate: [authGuard],
    loadComponent: () => import('./features/portal/portal-selector/portal-selector.component').then(m => m.PortalSelectorComponent)
  },

  // Portal view and tools (protected)
  {
    path: 'portal/:portalName',
    canActivate: [authGuard],
    loadComponent: () => import('./features/portal/portal-layout/portal-layout.component').then(m => m.PortalLayoutComponent),
    children: [
      // Portal main view
      {
        path: '',
        loadComponent: () => import('./features/portal/portal-view/portal-view.component').then(m => m.PortalViewComponent)
      },

      // Contact registration (if required by portal)
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

  // Catch-all route - redirect to portals
  {
    path: '**',
    redirectTo: '/portals'
  }
];
