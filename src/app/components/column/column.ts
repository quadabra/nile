import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Column, TileId } from '../../../core/types';
import { TileComponent } from '../tile/tile';

@Component({
  selector: 'app-column',
  imports: [TileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full min-h-0 min-w-72 shrink-0',
    '[style.flex]': 'column().width + " 0 18rem"',
  },
  template: `
    <section class="flex h-full min-h-0 w-full flex-col gap-3">
      @for (tile of column().tiles; track tile.id) {
        <app-tile [tile]="tile" [columnId]="column().id" [focused]="tile.id === focusedTileId()" />
      }
    </section>
  `,
})
export class ColumnComponent {
  readonly column = input.required<Column>();
  readonly focusedTileId = input<TileId | undefined>(undefined);
}
