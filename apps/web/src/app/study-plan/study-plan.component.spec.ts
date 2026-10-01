import { TestBed } from '@angular/core/testing';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';
import { StudyPlanComponent } from './study-plan.component';

type Resource = components['schemas']['ResourceSummaryDto'];

const resources: Resource[] = [
  {
    id: 'resource-1',
    slug: 'intro-to-biology',
    title: 'Introduction to biology',
    description: 'Explore the foundations of biology.',
    mediaType: 'course',
    provider: 'Open Learning',
    language: 'en',
    licence: 'cc-by',
    usageTier: 'open',
    costModel: 'free',
    durationSeconds: 3600,
    pageCount: null,
    lastVerifiedAt: null,
  },
  {
    id: 'resource-2',
    slug: 'biology-reference',
    title: 'Biology reference guide',
    description: 'A concise guide to core ideas.',
    mediaType: 'book',
    provider: 'Learning Library',
    language: 'en',
    licence: 'public-domain',
    usageTier: 'open',
    costModel: 'paid',
    durationSeconds: null,
    pageCount: 120,
    lastVerifiedAt: null,
  },
  {
    id: 'resource-3',
    slug: 'biology-tutorial',
    title: 'Cells and life',
    description: 'Learn how cells work.',
    mediaType: 'tutorial',
    provider: 'Open Learning',
    language: 'en',
    licence: 'cc0',
    usageTier: 'open',
    costModel: 'free',
    durationSeconds: 1800,
    pageCount: null,
    lastVerifiedAt: null,
  },
];

describe('StudyPlanComponent', () => {
  const api = {
    getPublishedResources: vi.fn(),
    getPublishedResource: vi.fn(),
  };

  beforeEach(async () => {
    api.getPublishedResources.mockReset().mockResolvedValue(resources);
    api.getPublishedResource
      .mockReset()
      .mockResolvedValue({ canonicalUrl: 'https://example.test/biology' });

    await TestBed.configureTestingModule({
      imports: [StudyPlanComponent],
      providers: [{ provide: ApiClientService, useValue: api }],
    }).compileComponents();
  });

  it('loads published resources and filters by search and cost', async () => {
    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.resource-card')).toHaveLength(3);

    const search = compiled.querySelector<HTMLInputElement>('input[type="search"]');
    expect(search).not.toBeNull();
    search!.value = 'cells';
    search!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.resource-card')).toHaveLength(1);
    expect(compiled.textContent).toContain('Cells and life');
  });

  it('creates a personal week-by-week plan from selected resources', async () => {
    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.goal.set('Learn biology basics');
    component.weeks.set(2);
    component.hoursPerWeek.set(4);

    const compiled = fixture.nativeElement as HTMLElement;
    const checkboxes = compiled.querySelectorAll<HTMLInputElement>('.resource-card input');
    const firstCheckbox = checkboxes.item(0);
    const thirdCheckbox = checkboxes.item(2);
    expect(firstCheckbox).not.toBeNull();
    expect(thirdCheckbox).not.toBeNull();
    if (!firstCheckbox || !thirdCheckbox) {
      return;
    }
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new Event('change'));
    thirdCheckbox.checked = true;
    thirdCheckbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    component.createPlan();
    fixture.detectChanges();

    expect(compiled.querySelector('#plan-heading')?.textContent).toContain('Learn biology basics');
    expect(compiled.querySelector('.plan-summary')?.textContent).toContain('2 weeks');
    expect(compiled.querySelectorAll('.week-card')).toHaveLength(2);
    expect(compiled.querySelector('.week-list')?.textContent).toContain('Introduction to biology');
    expect(compiled.querySelector('.week-list')?.textContent).toContain('Cells and life');
    expect(compiled.textContent).toContain('not saved to an account or sent to the server');
  });

  it('loads the external link only when the learner asks to open a selected resource', async () => {
    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const firstResource = resources[0];
    expect(firstResource).toBeDefined();
    if (!firstResource) {
      return;
    }
    component.goal.set('Learn biology basics');
    component.selectedResourceIds.set([firstResource.id]);
    component.createPlan();
    await component.loadResourceLink(firstResource);
    fixture.detectChanges();

    expect(api.getPublishedResource).toHaveBeenCalledWith('intro-to-biology');
    expect(
      fixture.nativeElement.querySelector('a[href="https://example.test/biology"]'),
    ).not.toBeNull();
  });

  it('shows a clear error when catalog resources cannot be loaded', async () => {
    api.getPublishedResources.mockRejectedValueOnce(new Error('Network unavailable'));

    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Resources could not be loaded',
    );
  });
});
