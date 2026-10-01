import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged } from 'rxjs';
import { AUTH_PORT } from '../auth/auth-port';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';

type Learner = components['schemas']['LearnerDto'];

@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-learners',
  styleUrl: './learners.component.css',
  templateUrl: './learners.component.html',
})
export class LearnersComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AUTH_PORT);
  private readonly api = inject(ApiClientService);
  readonly authConfigured = this.auth.configured;
  readonly authenticated = signal(false);
  readonly learners = signal<Learner[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly loginError = signal('');

  ngOnInit(): void {
    this.auth.isAuthenticated$
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((authenticated) => {
        this.authenticated.set(authenticated);

        if (authenticated) {
          void this.loadLearners();
        } else {
          this.learners.set([]);
          this.loading.set(false);
          this.error.set('');
        }
      });
  }

  signIn(): void {
    this.loginError.set('');
    this.auth.login().subscribe({
      error: (error: unknown) => {
        console.error('Auth0 sign-in failed from the mentee roster', error);
        this.loginError.set('Sign-in could not be started. Please try again.');
      },
    });
  }

  signUp(): void {
    this.loginError.set('');
    this.auth.signUp().subscribe({
      error: (error: unknown) => {
        console.error('Auth0 sign-up could not be started from the mentee roster', error);
        this.loginError.set('Sign-up could not be started. Please try again.');
      },
    });
  }

  private async loadLearners(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      this.learners.set(await this.api.getLearners());
    } catch (error) {
      console.error('Mentee profiles could not be loaded', error);
      this.error.set(this.getLoadErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private getLoadErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.includes(': 401')) {
      return 'The API rejected the access token. Check that the Auth0 API Identifier matches the audience configured for both the web app and API, then sign in again.';
    }

    return 'Mentee profiles could not be loaded. Check that the API is available and try again.';
  }
}
