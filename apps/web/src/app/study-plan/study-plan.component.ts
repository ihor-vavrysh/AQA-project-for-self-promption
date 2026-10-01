import { Component, computed, OnInit, signal } from '@angular/core';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';

type Resource = components['schemas']['ResourceSummaryDto'];
type CostFilter = 'all' | Resource['costModel'];

interface PlannedWeek {
  week: number;
  resources: Resource[];
}

interface StudyPlan {
  goal: string;
  weeks: number;
  hoursPerWeek: number;
  schedule: PlannedWeek[];
}

@Component({
  selector: 'app-study-plan',
  styleUrl: './study-plan.component.css',
  templateUrl: './study-plan.component.html',
})
export class StudyPlanComponent implements OnInit {
  readonly resources = signal<Resource[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly linkError = signal('');
  readonly goal = signal('');
  readonly weeks = signal(4);
  readonly hoursPerWeek = signal(3);
  readonly search = signal('');
  readonly costFilter = signal<CostFilter>('all');
  readonly selectedResourceIds = signal<string[]>([]);
  readonly plan = signal<StudyPlan | null>(null);
  readonly resourceLinks = signal<Record<string, string>>({});
  readonly loadingLinkId = signal('');

  readonly filteredResources = computed(() => {
    const search = this.search().trim().toLocaleLowerCase();
    const costFilter = this.costFilter();

    return this.resources().filter((resource) => {
      const matchesCost = costFilter === 'all' || resource.costModel === costFilter;
      const searchable = `${resource.title} ${resource.description ?? ''} ${resource.provider}`;

      return matchesCost && searchable.toLocaleLowerCase().includes(search);
    });
  });

  readonly selectedResources = computed(() => {
    const selectedIds = new Set(this.selectedResourceIds());
    return this.resources().filter((resource) => selectedIds.has(resource.id));
  });

  constructor(private readonly api: ApiClientService) {}

  ngOnInit(): void {
    void this.loadResources();
  }

  updateGoal(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.goal.set(target.value);
      this.plan.set(null);
    }
  }

  updateWeeks(event: Event): void {
    const value = this.readNumberInput(event, 1, 12);
    if (value !== null) {
      this.weeks.set(value);
      this.plan.set(null);
    }
  }

  updateHoursPerWeek(event: Event): void {
    const value = this.readNumberInput(event, 1, 20);
    if (value !== null) {
      this.hoursPerWeek.set(value);
      this.plan.set(null);
    }
  }

  updateSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.search.set(target.value);
    }
  }

  updateCostFilter(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    switch (target.value) {
      case 'all':
      case 'free':
      case 'freemium':
      case 'paid':
        this.costFilter.set(target.value);
        break;
    }
  }

  toggleResource(resourceId: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.selectedResourceIds.update((selected) =>
      target.checked
        ? [...selected, resourceId]
        : selected.filter((selectedId) => selectedId !== resourceId),
    );
    this.plan.set(null);
  }

  createPlan(): void {
    const selected = this.selectedResources();
    const goal = this.goal().trim();

    if (!goal || selected.length === 0) {
      return;
    }

    const schedule = Array.from({ length: this.weeks() }, (_, index) => ({
      week: index + 1,
      resources: [] as Resource[],
    }));

    selected.forEach((resource, index) => {
      const weekIndex = Math.floor((index * schedule.length) / selected.length);
      const week = schedule[weekIndex];
      if (week) {
        week.resources.push(resource);
      }
    });

    this.plan.set({
      goal,
      weeks: this.weeks(),
      hoursPerWeek: this.hoursPerWeek(),
      schedule,
    });
  }

  async loadResourceLink(resource: Resource): Promise<void> {
    this.linkError.set('');
    this.loadingLinkId.set(resource.id);

    try {
      const detail = await this.api.getPublishedResource(resource.slug);
      this.resourceLinks.update((links) => ({ ...links, [resource.id]: detail.canonicalUrl }));
    } catch (error) {
      console.error(`Could not load the link for resource "${resource.slug}"`, error);
      this.linkError.set(`The link for “${resource.title}” could not be loaded. Please try again.`);
    } finally {
      this.loadingLinkId.set('');
    }
  }

  printPlan(): void {
    window.print();
  }

  formatMediaType(mediaType: Resource['mediaType']): string {
    return mediaType.charAt(0).toUpperCase() + mediaType.slice(1);
  }

  formatCostModel(costModel: Resource['costModel']): string {
    switch (costModel) {
      case 'free':
        return 'Free';
      case 'freemium':
        return 'Free with paid options';
      case 'paid':
        return 'Paid';
    }
  }

  private async loadResources(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');

    try {
      this.resources.set(await this.api.getPublishedResources());
    } catch (error) {
      console.error('Published resources could not be loaded for the study planner', error);
      this.loadError.set(
        'Resources could not be loaded. Please check your connection, then refresh this page.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  private readNumberInput(event: Event, minimum: number, maximum: number): number | null {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return null;
    }

    const value = Number(target.value);
    return Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
  }
}
