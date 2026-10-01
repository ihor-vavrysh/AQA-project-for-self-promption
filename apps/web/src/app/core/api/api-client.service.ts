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

  async getLearners(): Promise<components['schemas']['LearnerDto'][]> {
    const result = await this.authenticatedClient.GET('/api/v1/learners');

    if (!result.response.ok) {
      throw new Error(`Could not load mentee profiles: ${result.response.status}`);
    }

    if (!result.data) {
      throw new Error('API returned no mentee profile list');
    }

    return result.data;
  }

  async getLearner(learnerId: string): Promise<components['schemas']['LearnerDto']> {
    const result = await this.authenticatedClient.GET('/api/v1/learners/{learnerId}', {
      params: { path: { learnerId } },
    });

    if (!result.response.ok) {
      throw new Error(`Could not load the mentee profile: ${result.response.status}`);
    }

    if (!result.data) {
      throw new Error('API returned no mentee profile');
    }

    return result.data;
  }

  async createLearner(
    profile: components['schemas']['CreateLearnerDto'],
  ): Promise<components['schemas']['LearnerDto']> {
    const result = await this.authenticatedClient.POST('/api/v1/learners', {
      body: profile,
    });

    if (!result.response.ok) {
      throw new Error(`Could not create the mentee profile: ${result.response.status}`);
    }

    if (!result.data) {
      throw new Error('API returned no created mentee profile');
    }

    return result.data;
  }

  async updateLearner(
    learnerId: string,
    profile: components['schemas']['UpdateLearnerDto'],
  ): Promise<components['schemas']['LearnerDto']> {
    const result = await this.authenticatedClient.PATCH('/api/v1/learners/{learnerId}', {
      params: { path: { learnerId } },
      body: profile,
    });

    if (!result.response.ok) {
      throw new Error(`Could not update the mentee profile: ${result.response.status}`);
    }

    if (!result.data) {
      throw new Error('API returned no updated mentee profile');
    }

    return result.data;
  }

  async deleteLearner(learnerId: string): Promise<void> {
    const result = await this.authenticatedClient.DELETE('/api/v1/learners/{learnerId}', {
      params: { path: { learnerId } },
    });

    if (!result.response.ok) {
      throw new Error(`Could not delete the mentee profile: ${result.response.status}`);
    }
  }
}
