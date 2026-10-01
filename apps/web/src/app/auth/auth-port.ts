import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

export interface AuthPort {
  readonly configured: boolean;
  readonly isAuthenticated$: Observable<boolean>;
  login(): Observable<void>;
  logout(): Observable<void>;
  accessToken(): Promise<string | null>;
}

export const AUTH_PORT = new InjectionToken<AuthPort>('AUTH_PORT');
