/**
 * Login Component
 *
 * Handles Frappe authentication
 */

import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  // Form state
  protected username = signal('');
  protected password = signal('');
  protected rememberMe = signal(false);

  // UI state
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected showPassword = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  /**
   * Handle login form submission
   */
  onSubmit(): void {
    // Clear previous errors
    this.error.set(null);

    // Validate
    const usr = this.username().trim();
    const pwd = this.password();

    if (!usr || !pwd) {
      this.error.set('Por favor ingresa usuario y contraseña');
      return;
    }

    // Login
    this.loading.set(true);

    this.authService.login({ usr, pwd }).subscribe({
      next: (response) => {
        if (response.success) {
          // Navigate to portal selector
          this.router.navigate(['/portals']);
        } else {
          this.error.set(response.error || 'Error al iniciar sesión. Verifica tus credenciales.');
          this.loading.set(false);
        }
      },
      error: (err) => {
        console.error('Login error:', err);
        this.error.set('Error de conexión. Por favor intenta de nuevo.');
        this.loading.set(false);
      }
    });
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  /**
   * Clear error message
   */
  clearError(): void {
    this.error.set(null);
  }
}
