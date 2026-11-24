import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Column, Tile, TileId } from '../../../core/types';
import { TileComponent } from '../tile/tile';

interface TileRow {
  row: number;
  height: number;
  tiles: Tile[];
}

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
      @for (row of rows(); track row.row) {
        <div
          class="flex min-h-0 min-w-0 gap-3"
          [style.flex]="row.height + ' 1 0%'"
          [attr.data-row]="row.row"
        >
          @for (tile of row.tiles; track tile.id) {
            <app-tile
              [tile]="tile"
              [columnId]="column().id"
              [focused]="tile.id === focusedTileId()"
            />
          }
        </div>
      }
    </section>
  `,
})
export class ColumnComponent {
  readonly column = input.required<Column>();
  readonly focusedTileId = input<TileId | undefined>(undefined);

  protected readonly rows = computed(() => groupRows(this.column().tiles));
}

function groupRows(tiles: readonly Tile[]): TileRow[] {
  const rows: TileRow[] = [];
  for (const tile of tiles) {
    const last = rows[rows.length - 1];
    if (last !== undefined && last.row === tile.row) last.tiles.push(tile);
    else rows.push({ row: tile.row, height: tile.height, tiles: [tile] });
  }
  return rows;
}
