import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import type { AuthPort } from './auth-port';

@Injectable()
export class UnconfiguredAuthPort implements AuthPort {
  readonly configured = false;
  readonly isAuthenticated$ = of(false);

  login(): Observable<void> {
    return throwError(() => new Error('Auth0 is not configured'));
  }

  logout(): Observable<void> {
    return throwError(() => new Error('Auth0 is not configured'));
  }

  async accessToken(): Promise<null> {
    return null;
  }
}
