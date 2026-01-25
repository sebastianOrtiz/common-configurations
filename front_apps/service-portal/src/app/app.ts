import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FrappeApiService } from './core/services/frappe-api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private frappeApi = inject(FrappeApiService);

  ngOnInit(): void {
    // Fetch CSRF token on app initialization
    // This is required for website routes that don't inject the token automatically
    this.frappeApi.fetchCsrfToken().subscribe();
  }
}
