import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { distinctUntilChanged, filter } from 'rxjs';
import { AUTH_PORT } from './auth/auth-port';
import { ApiClientService } from './core/api/api-client.service';

@Component({
  imports: [AsyncPipe, RouterLink, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly auth = inject(AUTH_PORT);
  private readonly api = inject(ApiClientService);
  readonly authConfigured = this.auth.configured;
  readonly isAuthenticated$ = this.auth.isAuthenticated$;
  readonly apiStatus = signal('Checking...');
  readonly loginError = signal('');
  readonly profileStatus = signal('');

  constructor() {
    void this.checkApi();
    this.auth.isAuthenticated$
      .pipe(distinctUntilChanged(), filter(Boolean))
      .subscribe(() => void this.loadProfile());
  }

  signIn(): void {
    this.auth.login().subscribe({
      error: (error: unknown) => {
        console.error('Auth0 sign-in failed', error);
        this.loginError.set('Sign-in could not be started. Please try again.');
      },
    });
  }

  signOut(): void {
    this.auth.logout().subscribe({
      error: (error: unknown) => {
        console.error('Auth0 sign-out failed', error);
        this.loginError.set('Sign-out could not be completed. Please try again.');
      },
    });
  }

  private async checkApi(): Promise<void> {
    try {
      await this.api.checkHealth();
      this.apiStatus.set('Connected');
    } catch (error) {
      console.error('API health check failed', error);
      this.apiStatus.set('Unavailable');
    }
  }

  private async loadProfile(): Promise<void> {
    this.profileStatus.set('Loading tutor profile...');

    try {
      const profile = await this.api.getCurrentUser();
      this.profileStatus.set(`Signed in as ${profile.email ?? 'tutor'}`);
    } catch (error) {
      console.error('Tutor profile request failed', error);
      this.profileStatus.set('Could not load the tutor profile.');
    }
  }
}
