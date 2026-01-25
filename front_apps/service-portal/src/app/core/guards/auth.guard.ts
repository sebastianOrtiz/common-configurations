/**
 * Auth Guard
 *
 * Protects routes that require authentication
 */

import { Injectable, inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
class AuthGuardService {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate() {
    return this.authService.checkAuthStatus().pipe(
      take(1),
      map(isAuthenticated => {
        if (isAuthenticated) {
          return true;
        } else {
          // Redirect to login if not authenticated
          this.router.navigate(['/login']);
          return false;
        }
      })
    );
  }
}

/**
 * Functional guard for use in routes
 */
export const authGuard: CanActivateFn = () => {
  const service = inject(AuthGuardService);
  return service.canActivate();
};
