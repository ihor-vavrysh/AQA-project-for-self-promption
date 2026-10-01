import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';

type Learner = components['schemas']['LearnerDto'];

@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-learners',
  styleUrl: './learners.component.css',
  templateUrl: './learners.component.html',
})
export class LearnersComponent implements OnInit {
  private readonly api = inject(ApiClientService);
  readonly learners = signal<Learner[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    void this.loadLearners();
  }

  private async loadLearners(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      this.learners.set(await this.api.getLearners());
    } catch (error) {
      console.error('Mentee profiles could not be loaded', error);
      this.error.set(
        'Mentee profiles could not be loaded. Check that the API is available and sign in with a tutor account.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
