import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ColumnComponent } from '../column/column';
import { NileService } from '../../services/nile.service';
import { TileDragService } from '../../services/tile-drag.service';

@Component({
  selector: 'app-tiling-container',
  imports: [ColumnComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col' },
  template: `
    @if (nile.activeDesktop(); as desktop) {
      @if (desktop.columns.length === 0) {
        <div class="grid flex-1 place-items-center px-6 text-center" data-testid="empty-state">
          <p class="text-sm text-on-surface-variant">This desktop is empty.</p>
        </div>
      } @else {
        <div class="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3" data-testid="columns">
          @for (column of desktop.columns; track column.id) {
            <app-column [column]="column" [focusedTileId]="desktop.focused?.tileId" />
          }
        </div>
      }
    }
    @if (drag.preview(); as preview) {
      <div
        class="pointer-events-none fixed z-30 rounded-md bg-primary/30 ring-2 ring-primary"
        data-testid="drop-preview"
        [style.top.px]="preview.top"
        [style.left.px]="preview.left"
        [style.width.px]="preview.width"
        [style.height.px]="preview.height"
      ></div>
    }
  `,
})
export class TilingContainer {
  protected readonly nile = inject(NileService);
  protected readonly drag = inject(TileDragService);
}
