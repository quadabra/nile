import { Injectable, computed, signal } from '@angular/core';
import { LayoutEngine } from '../../core/layout-engine';
import {
  ColumnId,
  ColumnPatch,
  CreateColumnOptions,
  DesktopId,
  DesktopPatch,
  LayoutState,
  MoveTileTarget,
  OpenTileOptions,
  TileId,
  TilePatch,
} from '../../core/types';

/** Signal-обёртка над LayoutEngine. Каждый метод записывает новый state. */
@Injectable({ providedIn: 'root' })
export class NileService {
  private readonly state = signal<LayoutState>(LayoutEngine.createInitialState());

  /** Полное состояние. Не мутировать. */
  readonly layout = this.state.asReadonly();
  readonly desktops = computed(() => this.state().desktops);
  readonly activeDesktopId = computed(() => this.state().activeDesktopId);
  readonly activeDesktop = computed(() => {
    const state = this.state();
    return state.desktops.find((desktop) => desktop.id === state.activeDesktopId);
  });

  createDesktop(name?: string): void {
    this.commit((state) => LayoutEngine.createDesktop(state, name));
  }

  renameDesktop(desktopId: DesktopId, name: string): void {
    this.commit((state) => LayoutEngine.renameDesktop(state, desktopId, name));
  }

  updateDesktop(desktopId: DesktopId, patch: DesktopPatch): void {
    this.commit((state) => LayoutEngine.updateDesktop(state, desktopId, patch));
  }

  switchDesktop(desktopId: DesktopId): void {
    this.commit((state) => LayoutEngine.switchDesktop(state, desktopId));
  }

  closeDesktop(desktopId: DesktopId): void {
    this.commit((state) => LayoutEngine.closeDesktop(state, desktopId));
  }

  createColumn(options?: CreateColumnOptions): void {
    this.commit((state) => LayoutEngine.createColumn(state, options));
  }

  updateColumn(columnId: ColumnId, patch: ColumnPatch, desktopId?: DesktopId): void {
    this.commit((state) => LayoutEngine.updateColumn(state, columnId, patch, desktopId));
  }

  deleteColumn(columnId: ColumnId, desktopId?: DesktopId): void {
    this.commit((state) => LayoutEngine.deleteColumn(state, columnId, desktopId));
  }

  resizeColumn(columnId: ColumnId, width: number, desktopId?: DesktopId): void {
    this.commit((state) => LayoutEngine.resizeColumn(state, columnId, width, desktopId));
  }

  openTile(componentId: string, options?: OpenTileOptions): void {
    this.commit((state) => LayoutEngine.openTile(state, componentId, options));
  }

  closeTile(tileId: TileId, desktopId?: DesktopId): void {
    this.commit((state) => LayoutEngine.closeTile(state, tileId, desktopId));
  }

  updateTile(tileId: TileId, patch: TilePatch, desktopId?: DesktopId): void {
    this.commit((state) => LayoutEngine.updateTile(state, tileId, patch, desktopId));
  }

  resizeTile(tileId: TileId, height: number, desktopId?: DesktopId): void {
    this.commit((state) => LayoutEngine.resizeTile(state, tileId, height, desktopId));
  }

  moveTile(tileId: TileId, target: MoveTileTarget): void {
    this.commit((state) => LayoutEngine.moveTile(state, tileId, target));
  }

  focus(columnId: ColumnId, tileId: TileId, desktopId?: DesktopId): void {
    this.commit((state) => LayoutEngine.focus(state, columnId, tileId, desktopId));
  }

  private commit(update: (state: LayoutState) => LayoutState): void {
    this.state.update(update);
  }
}
