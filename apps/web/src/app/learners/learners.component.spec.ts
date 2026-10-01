import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';
import { LearnersComponent } from './learners.component';

const learner: components['schemas']['LearnerDto'] = {
  id: 'de305d54-75b4-431b-adb2-eb6b9e546014',
  pseudonym: 'Learner 01',
  ageBand: '11-13',
  locale: 'en-GB',
  curriculumCode: 'KS3',
  interests: ['space'],
  learningPreference: 'step-by-step',
  confidenceLevel: 'developing',
  attentionSpan: '10-20-minutes',
  gender: null,
  subject: 'Mathematics',
  level: 'Year 8',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

describe('LearnersComponent', () => {
  let api: { getLearners: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    api = { getLearners: vi.fn().mockResolvedValue([learner]) };
    await TestBed.configureTestingModule({
      imports: [LearnersComponent],
      providers: [provideRouter([]), { provide: ApiClientService, useValue: api }],
    }).compileComponents();
  });

  it('shows the tutor-owned mentee roster', async () => {
    const fixture = TestBed.createComponent(LearnersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Mentee profiles');
    expect(compiled.textContent).toContain('Learner 01');
    expect(compiled.textContent).toContain('Mathematics · Year 8');
    expect(compiled.querySelector('a[routerLink="/learners/new"]')).toBeTruthy();
  });

  it('shows an explicit error when the roster request fails', async () => {
    api.getLearners.mockRejectedValue(new Error('Unauthorized'));
    const fixture = TestBed.createComponent(LearnersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Check that the API is available',
    );
  });
});
