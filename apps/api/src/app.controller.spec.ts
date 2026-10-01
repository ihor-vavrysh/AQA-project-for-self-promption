import { validateEnvironment } from './config/environment.js';

describe('API environment', () => {
  it('requires valid database and Auth0 settings', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL:
          'postgres://tutorforge:tutorforge_dev@localhost:5432/tutorforge',
        AUTH0_DOMAIN: 'tenant.example.test',
        AUTH0_AUDIENCE: 'https://api.tutorforge.test',
      }),
    ).not.toThrow();
  });

  it('rejects missing Auth0 audience configuration', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL:
          'postgres://tutorforge:tutorforge_dev@localhost:5432/tutorforge',
        AUTH0_DOMAIN: 'tenant.example.test',
      }),
    ).toThrow();
  });

  it('rejects an Auth0 domain containing a URL scheme', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL:
          'postgres://tutorforge:tutorforge_dev@localhost:5432/tutorforge',
        AUTH0_DOMAIN: 'https://tenant.example.test',
        AUTH0_AUDIENCE: 'https://api.tutorforge.test',
      }),
    ).toThrow();
  });
});
