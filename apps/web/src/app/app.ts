import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { distinctUntilChanged, filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AUTH_PORT } from './auth/auth-port';
import { ApiClientService } from './core/api/api-client.service';

@Component({
  imports: [AsyncPipe, RouterLink, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AUTH_PORT);
  private readonly api = inject(ApiClientService);
  readonly authConfigured = this.auth.configured;
  readonly isAuthenticated$ = this.auth.isAuthenticated$;
  readonly apiStatus = signal('Checking...');
  readonly loginError = signal('');
  readonly profileStatus = signal('');

  constructor() {
    void this.checkApi();
    this.auth.errors$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((error) => {
      console.error('Auth0 authentication failed', error);
      if (!this.loginError()) {
        this.loginError.set(this.getAuthErrorMessage(error));
      }
    });
    this.auth.isAuthenticated$
      .pipe(distinctUntilChanged(), filter(Boolean))
      .subscribe(() => void this.loadProfile());
  }

  signIn(): void {
    this.loginError.set('');
    this.auth.login().subscribe({
      error: (error: unknown) => {
        console.error('Auth0 sign-in failed', error);
        this.loginError.set('Sign-in could not be started. Please try again.');
      },
    });
  }

  signUp(): void {
    this.loginError.set('');
    this.auth.signUp().subscribe({
      error: (error: unknown) => {
        console.error('Auth0 sign-up could not be started', error);
        this.loginError.set('Sign-up could not be started. Please try again.');
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

  private getAuthErrorMessage(error: Error): string {
    const details = [
      error.message,
      error.toString(),
      ...Object.values(error).filter((value): value is string => typeof value === 'string'),
    ].join(' ');

    if (details.includes('Service not found:')) {
      return 'Auth0 could not find the requested API. In Auth0 Dashboard, create an API with identifier https://api.tutorforge.local, then try signing in again.';
    }

    if (details.includes('is not authorized to access resource server')) {
      return 'Auth0 recognizes the API but has not authorized this SPA to request its access tokens. Enable access for the AQA-project-for-self-promption SPA in the API settings, then sign in again.';
    }

    return 'Auth0 could not complete authentication. Check the application callback URL and try again.';
  }
}
