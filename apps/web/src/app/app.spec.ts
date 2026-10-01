import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { AUTH_PORT } from './auth/auth-port';
import { App } from './app';
import { ApiClientService } from './core/api/api-client.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: AUTH_PORT,
          useValue: {
            configured: false,
            isAuthenticated$: of(false),
            login: () => throwError(() => new Error('Auth0 is not configured')),
            logout: () => throwError(() => new Error('Auth0 is not configured')),
            accessToken: async () => null,
          },
        },
        { provide: ApiClientService, useValue: { checkHealth: async () => undefined } },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('shows a clear sign-in setup state', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Make every lesson');
    expect(compiled.querySelector('button')?.disabled).toBe(true);
  });
});
