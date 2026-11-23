import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ColumnId, Tile } from '../../../core/types';
import { NileService } from '../../services/nile.service';

@Component({
  selector: 'app-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-36 min-w-0',
    '[style.flex]': 'tile().height + " 1 auto"',
  },
  template: `
    <article
      class="flex min-h-36 w-full flex-col rounded-lg border border-outline-variant bg-tile ring-primary"
      [class.ring-2]="focused()"
      (click)="focusTile()"
    >
      <header
        class="flex items-center justify-between gap-2 border-b border-outline-variant px-3 py-2"
      >
        <h2 class="truncate text-sm font-medium">{{ tile().componentId }}</h2>
        <button
          type="button"
          class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          aria-label="Close tile"
          (click)="close($event)"
        >
          <span class="material-symbols-outlined text-xl" aria-hidden="true">close</span>
        </button>
      </header>
      <p class="px-3 py-3 text-sm text-on-surface-variant">{{ tile().componentId }}</p>
    </article>
  `,
})
export class TileComponent {
  private readonly nile = inject(NileService);

  readonly tile = input.required<Tile>();
  readonly columnId = input.required<ColumnId>();
  readonly focused = input(false);

  protected focusTile(): void {
    this.nile.focus(this.columnId(), this.tile().id);
  }

  protected close(event: Event): void {
    event.stopPropagation();
    this.nile.closeTile(this.tile().id);
  }
}
