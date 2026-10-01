import { Injectable, inject } from '@angular/core';
import createClient from 'openapi-fetch';
import type { components, paths } from './api.generated';
import { AUTH_PORT } from '../../auth/auth-port';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly auth = inject(AUTH_PORT);
  private readonly client = createClient<paths>({ baseUrl: '/' });
  private readonly authenticatedClient = createClient<paths>({
    baseUrl: '/',
    fetch: async (request) => {
      const token = await this.auth.accessToken();

      if (!token) {
        return fetch(request);
      }

      const headers = new Headers(request.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(new Request(request, { headers }));
    },
  });

  async checkHealth(): Promise<void> {
    const result = await this.client.GET('/api/v1/health');

    if (!result.response.ok) {
      throw new Error(`API health check returned ${result.response.status}`);
    }

    if (!result.data || result.data.status !== 'ok') {
      throw new Error('API returned an invalid health response');
    }
  }

  /**
   * POST for a read: the body carries a coarse learner profile, which must not end up in
   * access logs, cache keys or the Referer header.
   */
  async getSuggestions(
    body: components['schemas']['LearnerContextDto'],
  ): Promise<components['schemas']['SuggestionListDto']> {
    const result = await this.client.POST('/api/v1/catalog/suggestions', { body });

    if (!result.response.ok) {
      throw new Error(`Could not load suggestions: ${result.response.status}`);
    }

    if (!result.data) {
      throw new Error('API returned no suggestions payload');
    }

    return result.data;
  }

  async getCurrentUser(): Promise<components['schemas']['CurrentUserDto']> {
    const result = await this.authenticatedClient.GET('/api/v1/me');

    if (!result.response.ok) {
      throw new Error(`Could not load the tutor profile: ${result.response.status}`);
    }

    if (!result.data) {
      throw new Error('API returned no tutor profile');
    }

    return result.data;
  }
}
