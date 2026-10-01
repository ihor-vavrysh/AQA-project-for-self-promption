import { Component, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';

type TaxonomyNode = components['schemas']['TaxonomyTreeNodeDto'];

@Component({
  imports: [NgTemplateOutlet],
  selector: 'app-catalog',
  styleUrl: './catalog.component.css',
  templateUrl: './catalog.component.html',
})
export class CatalogComponent implements OnInit {
  readonly taxonomy = signal<TaxonomyNode[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor(private readonly api: ApiClientService) {}

  ngOnInit(): void {
    void this.loadTaxonomy();
  }

  label(node: Pick<TaxonomyNode, 'names' | 'slug'>): string {
    return node.names?.['en'] ?? node.slug;
  }

  private async loadTaxonomy(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const nodes = await this.api.getTaxonomyTree();
      this.taxonomy.set(nodes);
    } catch (error) {
      console.error('Catalog taxonomy failed to load', error);
      this.error.set(
        'The catalog could not be loaded. Check that the API is available and try again.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
