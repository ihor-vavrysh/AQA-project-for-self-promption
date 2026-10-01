import { Injectable, inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import type { AuthPort } from './auth-port';

@Injectable()
export class Auth0Port implements AuthPort {
  private readonly auth = inject(AuthService);
  readonly configured = true;
  readonly isAuthenticated$ = this.auth.isAuthenticated$;

  login() {
    return this.auth.loginWithRedirect();
  }

  logout() {
    return this.auth.logout({
      logoutParams: { returnTo: `${window.location.origin}/` },
    });
  }

  async accessToken(): Promise<string | null> {
    if (!(await firstValueFrom(this.auth.isAuthenticated$))) {
      return null;
    }

    return (await firstValueFrom(this.auth.getAccessTokenSilently())) ?? null;
  }
}
