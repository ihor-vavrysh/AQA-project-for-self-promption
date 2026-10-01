import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';
import { LearnerFormComponent } from './learner-form.component';

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

describe('LearnerFormComponent', () => {
  let api: { createLearner: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    api = { createLearner: vi.fn().mockResolvedValue(learner) };
    await TestBed.configureTestingModule({
      imports: [LearnerFormComponent],
      providers: [provideRouter([]), { provide: ApiClientService, useValue: api }],
    }).compileComponents();
  });

  it('creates a pseudonymous profile and returns to the roster', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(LearnerFormComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.patchValue({
      pseudonym: 'Learner 01',
      subject: 'Mathematics',
      level: 'Year 8',
      interests: 'space, music',
    });

    await component.save();

    expect(api.createLearner).toHaveBeenCalledWith(
      expect.objectContaining({
        pseudonym: 'Learner 01',
        ageBand: '11-13',
        interests: ['space', 'music'],
        gender: null,
      }),
    );
    expect(navigate).toHaveBeenCalledWith(['/learners']);
  });

  it('warns against entering learner-identifying information', () => {
    const fixture = TestBed.createComponent(LearnerFormComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Do not add a real name, email, date of birth',
    );
  });
});
