import { TestBed } from '@angular/core/testing';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';
import { CatalogComponent } from './catalog.component';

type TaxonomyNode = components['schemas']['TaxonomyTreeNodeDto'];

const taxonomy: TaxonomyNode[] = [
  {
    id: 'root',
    parentId: null,
    scheme: 'isced-f',
    code: '05',
    slug: 'science',
    path: '05',
    depth: 0,
    names: { en: 'Science' },
    resourceCount: 0,
    mediaTypeCount: 0,
    published: false,
    children: [
      {
        id: 'subject',
        parentId: 'root',
        scheme: 'internal',
        code: 'biology',
        slug: 'biology',
        path: '05.biology',
        depth: 1,
        names: { en: 'Biology' },
        resourceCount: 0,
        mediaTypeCount: 0,
        published: false,
        children: [
          {
            id: 'stage',
            parentId: 'subject',
            scheme: 'internal',
            code: 'ks4-biology',
            slug: 'ks4-biology',
            path: '05.biology.ks4-biology',
            depth: 2,
            names: { en: 'Biology (KS4)' },
            resourceCount: 0,
            mediaTypeCount: 0,
            published: false,
            children: [
              {
                id: 'topic',
                parentId: 'stage',
                scheme: 'internal',
                code: 'inheritance',
                slug: 'inheritance',
                path: '05.biology.ks4-biology.inheritance',
                depth: 3,
                names: { en: 'Inheritance and variation' },
                resourceCount: 0,
                mediaTypeCount: 0,
                published: false,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
];

describe('CatalogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [
        {
          provide: ApiClientService,
          useValue: { getTaxonomyTree: vi.fn().mockResolvedValue(taxonomy) },
        },
      ],
    }).compileComponents();
  });

  it('renders nested taxonomy topics at every depth', async () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Topics and categories');
    expect(compiled.textContent).toContain('Science');
    expect(compiled.textContent).toContain('Biology');
    expect(compiled.textContent).toContain('Biology (KS4)');
    expect(compiled.textContent).toContain('Inheritance and variation');
  });
});
