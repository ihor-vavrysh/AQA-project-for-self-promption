import { importProvidersFrom, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import type { ApplicationConfig, EnvironmentProviders, Provider } from '@angular/core';
import type { PublicAppConfig } from '@tutorforge/shared';
import { AUTH_PORT } from './auth/auth-port';
import { UnconfiguredAuthPort } from './auth/unconfigured-auth-port';
import { routes } from './app.routes';

export async function createAppConfig(config: PublicAppConfig): Promise<ApplicationConfig> {
  const authConfigured = Boolean(
    config.auth0.domain && config.auth0.clientId && config.auth0.audience,
  );
  let authProviders: Array<Provider | EnvironmentProviders>;

  if (authConfigured) {
    const [{ AuthModule }, { Auth0Port }] = await Promise.all([
      import('@auth0/auth0-angular'),
      import('./auth/auth0-port'),
    ]);
    authProviders = [
      importProvidersFrom(
        AuthModule.forRoot({
          domain: config.auth0.domain,
          clientId: config.auth0.clientId,
          authorizationParams: {
            redirect_uri: `${window.location.origin}/`,
            audience: config.auth0.audience,
          },
        }),
      ),
      { provide: AUTH_PORT, useClass: Auth0Port },
    ];
  } else {
    authProviders = [{ provide: AUTH_PORT, useClass: UnconfiguredAuthPort }];
  }

  return {
    providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes), ...authProviders],
  };
}
