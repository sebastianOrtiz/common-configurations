/**
 * Tool Not Found Component
 *
 * Displayed when a tool type is not recognized
 */

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';

@Component({
  selector: 'app-tool-not-found',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tool-not-found">
      <div class="content">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2>Herramienta No Encontrada</h2>
        <p>La herramienta solicitada no está disponible o no existe.</p>
        <button class="btn-back" (click)="goBack()">
          Volver al Portal
        </button>
      </div>
    </div>
  `,
  styles: [`
    .tool-not-found {
      min-height: 80vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .content {
      text-align: center;
      max-width: 400px;
    }

    svg {
      width: 80px;
      height: 80px;
      color: #e53e3e;
      margin-bottom: 1.5rem;
    }

    h2 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1a202c;
      margin: 0 0 1rem;
    }

    p {
      color: #718096;
      font-size: 1rem;
      margin: 0 0 2rem;
      line-height: 1.6;
    }

    .btn-back {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 0.5rem;
      padding: 0.875rem 2rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
      }

      &:active {
        transform: translateY(0);
      }
    }
  `]
})
export class ToolNotFoundComponent {
  constructor(
    private router: Router,
    private stateService: StateService
  ) {}

  goBack(): void {
    const portal = this.stateService.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    } else {
      this.router.navigate(['/portals']);
    }
  }
}
