import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ColumnId, Tile } from '../../../core/types';
import { NileService } from '../../services/nile.service';
import { TileDragService } from '../../services/tile-drag.service';

@Component({
  selector: 'app-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 min-w-0 touch-none',
    '[style.flex]': 'tile().width + " 1 0%"',
    '[attr.data-tile-id]': 'tile().id',
    '[class.opacity-40]': 'drag.sourceId() === tile().id',
  },
  template: `
    <article
      class="flex h-full min-h-0 w-full cursor-grab flex-col overflow-hidden rounded-lg border border-outline-variant bg-tile ring-primary"
      [class.cursor-grabbing]="drag.sourceId() === tile().id"
      [class.ring-2]="focused()"
      (pointerdown)="pointerDown($event)"
      (pointermove)="drag.move($event)"
      (pointerup)="pointerUp($event)"
      (pointercancel)="drag.cancel()"
    >
      <header
        class="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant px-3 py-2"
      >
        <h2 class="truncate text-sm font-medium">{{ tile().componentId }}</h2>
        <button
          type="button"
          class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          aria-label="Close tile"
          (pointerdown)="$event.stopPropagation()"
          (click)="close($event)"
        >
          <span class="material-symbols-outlined text-xl" aria-hidden="true">close</span>
        </button>
      </header>
      <p class="min-h-0 flex-1 overflow-auto px-3 py-3 text-sm text-on-surface-variant">
        {{ tile().componentId }}
      </p>
    </article>
  `,
})
export class TileComponent {
  private readonly nile = inject(NileService);
  protected readonly drag = inject(TileDragService);

  readonly tile = input.required<Tile>();
  readonly columnId = input.required<ColumnId>();
  readonly focused = input(false);

  protected pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.drag.begin(this.tile().id, event);
  }

  protected pointerUp(event: PointerEvent): void {
    if (this.drag.end(event)) return;
    this.nile.focus(this.columnId(), this.tile().id);
  }

  protected close(event: Event): void {
    event.stopPropagation();
    this.nile.closeTile(this.tile().id);
  }
}
