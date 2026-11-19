/**
 * NILE Layout Engine
 * Чистая логика и состояние. Иммутабельные операции.
 */

import {
  LayoutState,
  Desktop,
  DesktopId,
  DesktopPatch,
  Column,
  ColumnId,
  ColumnPatch,
  Tile,
  TileId,
  TilePatch,
  OpenTileOptions,
  CreateColumnOptions,
  MoveTileTarget,
} from './types';

interface ColumnLocation {
  desktopIndex: number;
  columnIndex: number;
}

interface TileLocation extends ColumnLocation {
  tileIndex: number;
}

const DEFAULT_COLUMN_WIDTH = 1;
const DEFAULT_TILE_HEIGHT = 1;

/**
 * Иммутабельные операции над раскладкой.
 * Методы не изменяют переданный `state` и возвращают новое состояние,
 * если операция что-то меняет.
 */
export class LayoutEngine {
  /**
   * Создаёт начальное состояние с одним пустым десктопом.
   * @param desktopName Имя первого десктопа. По умолчанию `'1'`.
   */
  static createInitialState(desktopName = '1'): LayoutState {
    assertDesktopName(desktopName);
    const desktop = createDesktopEntity(desktopName, 1);
    return {
      desktops: [desktop],
      activeDesktopId: desktop.id,
    };
  }

  /**
   * Создаёт новый пустой десктоп в конце списка.
   * Не делает его активным. Если имя не задано, используется порядковый номер.
   */
  static createDesktop(state: LayoutState, name?: string): LayoutState {
    const order = state.desktops.length + 1;
    const desktopName = name ?? String(order);
    assertDesktopName(desktopName);
    return {
      ...state,
      desktops: [...state.desktops, createDesktopEntity(desktopName, order)],
    };
  }

  /**
   * Возвращает десктоп по id.
   * Результат — часть состояния, его нельзя мутировать.
   */
  static getDesktop(state: LayoutState, desktopId: DesktopId): Desktop | undefined {
    return state.desktops.find((desktop) => desktop.id === desktopId);
  }

  /**
   * Меняет имя и/или порядковый номер десктопа.
   * После смены номера все десктопы нумеруются заново с 1.
   */
  static updateDesktop(state: LayoutState, desktopId: DesktopId, patch: DesktopPatch): LayoutState {
    const index = requireDesktopIndex(state, desktopId);
    const desktop = desktopAt(state, index);
    const name = patch.name ?? desktop.name;
    const order = patch.order ?? desktop.order;

    if (patch.name !== undefined) assertDesktopName(name);
    if (patch.order !== undefined) assertDesktopOrder(order, state.desktops.length);

    const nameChanged = name !== desktop.name;
    const orderChanged = order !== desktop.order;
    if (!nameChanged && !orderChanged) return state;

    const desktops = state.desktops.slice();
    desktops[index] = nameChanged ? { ...desktop, name } : desktop;

    if (!orderChanged) return { ...state, desktops };

    const moved = desktops.splice(index, 1)[0];
    if (moved === undefined) throw new Error(`Desktop not found: ${desktopId}`);
    desktops.splice(order - 1, 0, moved);
    return { ...state, desktops: withOrders(desktops) };
  }

  /**
   * Переименовывает десктоп.
   */
  static renameDesktop(state: LayoutState, desktopId: DesktopId, name: string): LayoutState {
    return LayoutEngine.updateDesktop(state, desktopId, { name });
  }

  /**
   * Переключает активный десктоп.
   */
  static switchDesktop(state: LayoutState, desktopId: DesktopId): LayoutState {
    requireDesktopIndex(state, desktopId);
    if (state.activeDesktopId === desktopId) return state;
    return { ...state, activeDesktopId: desktopId };
  }

  /**
   * Закрывает десктоп. Если это был последний — создаёт новый пустой.
   * Если закрыт активный, активным становится десктоп на том же месте
   * (или предыдущий, если закрыт последний).
   */
  static closeDesktop(state: LayoutState, desktopId: DesktopId): LayoutState {
    const index = requireDesktopIndex(state, desktopId);
    if (state.desktops.length === 1) return LayoutEngine.createInitialState();

    const desktops = withOrders(state.desktops.filter((desktop) => desktop.id !== desktopId));
    if (state.activeDesktopId !== desktopId) {
      return { ...state, desktops };
    }

    const nextIndex = Math.min(index, desktops.length - 1);
    const active = desktops[nextIndex];
    if (active === undefined) return LayoutEngine.createInitialState();
    return { desktops, activeDesktopId: active.id };
  }

  /**
   * Добавляет пустую колонку в десктоп.
   * По умолчанию — в конец активного десктопа, ширина 1.
   */
  static createColumn(state: LayoutState, options?: CreateColumnOptions): LayoutState {
    const desktopIndex = resolveDesktopIndex(state, options?.desktopId);
    const desktop = desktopAt(state, desktopIndex);
    const index = options?.index ?? desktop.columns.length;
    assertInsertIndex(index, desktop.columns.length, 'Column index');

    const columns = desktop.columns.slice();
    columns.splice(
      index,
      0,
      createColumnEntity(options?.width ?? DEFAULT_COLUMN_WIDTH, options?.minWidth),
    );
    return withDesktop(state, desktopIndex, { ...desktop, columns });
  }

  /**
   * Возвращает колонку по id.
   * Без `desktopId` ищет по всем десктопам. Результат нельзя мутировать.
   */
  static getColumn(
    state: LayoutState,
    columnId: ColumnId,
    desktopId?: DesktopId,
  ): Column | undefined {
    const location = findColumn(state, columnId, desktopId);
    if (location === undefined) return undefined;
    return desktopAt(state, location.desktopIndex).columns[location.columnIndex];
  }

  /**
   * Меняет ширину и/или минимальную ширину колонки.
   */
  static updateColumn(
    state: LayoutState,
    columnId: ColumnId,
    patch: ColumnPatch,
    desktopId?: DesktopId,
  ): LayoutState {
    const location = requireColumn(state, columnId, desktopId);
    const desktop = desktopAt(state, location.desktopIndex);
    const column = columnAt(desktop, location.columnIndex);
    const width = patch.width ?? column.width;
    const minWidth = patch.minWidth !== undefined ? patch.minWidth : column.minWidth;

    if (patch.width !== undefined) assertPositive(width, 'Column width');
    if (patch.minWidth !== undefined) assertPositive(patch.minWidth, 'Column minWidth');
    if (minWidth !== undefined && width < minWidth) {
      throw new Error('Column width must not be less than minWidth');
    }
    if (width === column.width && minWidth === column.minWidth) return state;

    const updated: Column = { ...column, width };
    if (patch.minWidth !== undefined) updated.minWidth = patch.minWidth;

    const columns = desktop.columns.slice();
    columns[location.columnIndex] = updated;
    return withDesktop(state, location.desktopIndex, { ...desktop, columns });
  }

  /**
   * Удаляет колонку вместе с её тайлами.
   * Если в колонке был фокус — фокус сбрасывается.
   */
  static deleteColumn(state: LayoutState, columnId: ColumnId, desktopId?: DesktopId): LayoutState {
    const location = requireColumn(state, columnId, desktopId);
    const desktop = desktopAt(state, location.desktopIndex);
    const columns = desktop.columns.filter((column) => column.id !== columnId);
    const nextDesktop: Desktop = { ...desktop, columns };
    const cleared = desktop.focused?.columnId === columnId ? clearFocus(nextDesktop) : nextDesktop;
    return withDesktop(state, location.desktopIndex, cleared);
  }

  /**
   * Изменяет ширину колонки.
   */
  static resizeColumn(
    state: LayoutState,
    columnId: ColumnId,
    width: number,
    desktopId?: DesktopId,
  ): LayoutState {
    return LayoutEngine.updateColumn(state, columnId, { width }, desktopId);
  }

  /**
   * Открывает новый тайл.
   * По умолчанию добавляет в focused колонку активного десктопа (в конец)
   * или создаёт новую колонку. Новый тайл получает фокус.
   */
  static openTile(state: LayoutState, componentId: string, options?: OpenTileOptions): LayoutState {
    assertComponentId(componentId);
    const height = options?.height ?? DEFAULT_TILE_HEIGHT;
    assertPositive(height, 'Tile height');

    const desktopIndex = resolveDesktopIndex(state, options?.desktopId);
    const desktop = desktopAt(state, desktopIndex);
    const existingColumnIndex = resolveOpenColumnIndex(desktop, options);

    const tile = createTile(componentId, height, options?.props);
    let columns = desktop.columns;
    let column: Column;
    let columnIndex: number;

    if (existingColumnIndex === undefined) {
      column = createColumnEntity(DEFAULT_COLUMN_WIDTH);
      columns = [...desktop.columns, column];
      columnIndex = columns.length - 1;
    } else {
      columnIndex = existingColumnIndex;
      const existing = desktop.columns[columnIndex];
      if (existing === undefined) throw new Error(`Column not found: ${options?.columnId ?? ''}`);
      column = existing;
    }

    const insertAt = options?.index ?? column.tiles.length;
    assertInsertIndex(insertAt, column.tiles.length, 'Tile index');

    const tiles = column.tiles.slice();
    tiles.splice(insertAt, 0, tile);
    const nextColumn: Column = { ...column, tiles: withPositions(tiles) };
    const nextColumns = columns.slice();
    nextColumns[columnIndex] = nextColumn;

    return withDesktop(state, desktopIndex, {
      ...desktop,
      columns: nextColumns,
      focused: { columnId: nextColumn.id, tileId: tile.id },
    });
  }

  /**
   * Возвращает тайл по id.
   * Без `desktopId` ищет по всем десктопам. Результат нельзя мутировать.
   */
  static getTile(state: LayoutState, tileId: TileId, desktopId?: DesktopId): Tile | undefined {
    const location = findTile(state, tileId, desktopId);
    if (location === undefined) return undefined;
    return tileAt(desktopAt(state, location.desktopIndex), location);
  }

  /**
   * Меняет размер, положение, компонент или props тайла.
   * Положение — индекс внутри текущей колонки.
   */
  static updateTile(
    state: LayoutState,
    tileId: TileId,
    patch: TilePatch,
    desktopId?: DesktopId,
  ): LayoutState {
    const location = requireTile(state, tileId, desktopId);
    const desktop = desktopAt(state, location.desktopIndex);
    const column = columnAt(desktop, location.columnIndex);
    const tile = tileAt(desktop, location);

    const componentId = patch.componentId ?? tile.componentId;
    const height = patch.height ?? tile.height;
    const position = patch.position ?? tile.position;
    const minHeight = patch.minHeight !== undefined ? patch.minHeight : tile.minHeight;

    if (patch.componentId !== undefined) assertComponentId(componentId);
    if (patch.height !== undefined) assertPositive(height, 'Tile height');
    if (patch.minHeight !== undefined) assertPositive(patch.minHeight, 'Tile minHeight');
    if (minHeight !== undefined && height < minHeight) {
      throw new Error('Tile height must not be less than minHeight');
    }
    if (patch.position !== undefined) assertTilePosition(position, column.tiles.length);

    const nextProps = patch.props !== undefined ? cloneProps(patch.props) : tile.props;
    const unchanged =
      componentId === tile.componentId &&
      height === tile.height &&
      position === tile.position &&
      minHeight === tile.minHeight &&
      (patch.props === undefined || sameJson(nextProps, tile.props));
    if (unchanged) return state;

    const updated: Tile = { ...tile, componentId, height };
    if (patch.minHeight !== undefined) updated.minHeight = patch.minHeight;
    if (patch.props !== undefined) updated.props = nextProps;

    let tiles = column.tiles.slice();
    tiles[location.tileIndex] = updated;
    if (position !== tile.position) {
      const moved = tiles.splice(location.tileIndex, 1)[0];
      if (moved === undefined) throw new Error(`Tile not found: ${tileId}`);
      tiles.splice(position, 0, moved);
      tiles = withPositions(tiles);
    }

    const columns = desktop.columns.slice();
    columns[location.columnIndex] = { ...column, tiles };
    return withDesktop(state, location.desktopIndex, { ...desktop, columns });
  }

  /**
   * Закрывает тайл. Если колонка осталась пустой — удаляет колонку.
   * Если закрыт сфокусированный тайл, фокус переходит к соседнему.
   */
  static closeTile(state: LayoutState, tileId: TileId, desktopId?: DesktopId): LayoutState {
    const location = requireTile(state, tileId, desktopId);
    const desktop = desktopAt(state, location.desktopIndex);
    const column = columnAt(desktop, location.columnIndex);
    const tiles = withPositions(column.tiles.filter((tile) => tile.id !== tileId));

    const columns = desktop.columns.slice();
    const columnRemoved = tiles.length === 0;
    if (columnRemoved) columns.splice(location.columnIndex, 1);
    else columns[location.columnIndex] = { ...column, tiles };

    let nextDesktop: Desktop = { ...desktop, columns };
    if (desktop.focused?.tileId === tileId) {
      nextDesktop = columnRemoved
        ? refocusAfterColumnRemoval(nextDesktop, location.columnIndex)
        : refocusAfterTileRemoval(nextDesktop, location.columnIndex, location.tileIndex);
    }

    return withDesktop(state, location.desktopIndex, nextDesktop);
  }

  /**
   * Изменяет высоту тайла внутри колонки.
   */
  static resizeTile(
    state: LayoutState,
    tileId: TileId,
    height: number,
    desktopId?: DesktopId,
  ): LayoutState {
    return LayoutEngine.updateTile(state, tileId, { height }, desktopId);
  }

  /**
   * Перемещает тайл (между колонками, внутри колонки, в новый столбец и т.д.).
   */
  static moveTile(state: LayoutState, tileId: TileId, target: MoveTileTarget): LayoutState {
    void state;
    void tileId;
    void target;
    throw new Error('Not implemented');
  }

  /**
   * Устанавливает фокус на тайл. Тайл должен лежать в указанной колонке.
   * Активный десктоп не переключается.
   */
  static focus(
    state: LayoutState,
    columnId: ColumnId,
    tileId: TileId,
    desktopId?: DesktopId,
  ): LayoutState {
    const location = requireColumn(state, columnId, desktopId);
    const desktop = desktopAt(state, location.desktopIndex);
    const column = columnAt(desktop, location.columnIndex);
    if (!column.tiles.some((tile) => tile.id === tileId)) {
      throw new Error(`Tile not found: ${tileId}`);
    }
    if (desktop.focused?.columnId === columnId && desktop.focused.tileId === tileId) return state;
    return withDesktop(state, location.desktopIndex, {
      ...desktop,
      focused: { columnId, tileId },
    });
  }

  /**
   * Сериализует состояние в JSON-совместимый объект.
   */
  static toJSON(state: LayoutState): unknown {
    void state;
    throw new Error('Not implemented');
  }

  /**
   * Восстанавливает состояние из JSON.
   */
  static fromJSON(data: unknown): LayoutState {
    void data;
    throw new Error('Not implemented');
  }
}

function createId(prefix: 'dsk' | 'col' | 'tile'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createDesktopEntity(name: string, order: number): Desktop {
  return {
    id: createId('dsk'),
    order,
    name,
    columns: [],
  };
}

function createColumnEntity(width: number, minWidth?: number): Column {
  assertPositive(width, 'Column width');
  if (minWidth !== undefined) {
    assertPositive(minWidth, 'Column minWidth');
    if (width < minWidth) throw new Error('Column width must not be less than minWidth');
  }
  const column: Column = {
    id: createId('col'),
    width,
    tiles: [],
  };
  if (minWidth !== undefined) column.minWidth = minWidth;
  return column;
}

function createTile(componentId: string, height: number, props?: Record<string, unknown>): Tile {
  const tile: Tile = {
    id: createId('tile'),
    componentId,
    height,
    position: 0,
  };
  if (props !== undefined) tile.props = cloneProps(props);
  return tile;
}

function cloneProps(props: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(props);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function desktopAt(state: LayoutState, index: number): Desktop {
  const desktop = state.desktops[index];
  if (desktop === undefined) throw new Error(`Desktop not found at index ${index}`);
  return desktop;
}

function columnAt(desktop: Desktop, index: number): Column {
  const column = desktop.columns[index];
  if (column === undefined) throw new Error(`Column not found at index ${index}`);
  return column;
}

function tileAt(desktop: Desktop, location: TileLocation): Tile {
  const tile = columnAt(desktop, location.columnIndex).tiles[location.tileIndex];
  if (tile === undefined) throw new Error(`Tile not found at index ${location.tileIndex}`);
  return tile;
}

function withDesktop(state: LayoutState, desktopIndex: number, desktop: Desktop): LayoutState {
  const desktops = state.desktops.slice();
  desktops[desktopIndex] = desktop;
  return { activeDesktopId: state.activeDesktopId, desktops };
}

function withOrders(desktops: readonly Desktop[]): Desktop[] {
  return desktops.map((desktop, index) => {
    const order = index + 1;
    return desktop.order === order ? desktop : { ...desktop, order };
  });
}

function withPositions(tiles: readonly Tile[]): Tile[] {
  return tiles.map((tile, index) =>
    tile.position === index ? tile : { ...tile, position: index },
  );
}

function clearFocus(desktop: Desktop): Desktop {
  if (desktop.focused === undefined) return desktop;
  return {
    id: desktop.id,
    order: desktop.order,
    name: desktop.name,
    columns: desktop.columns,
  };
}

function refocusAfterTileRemoval(
  desktop: Desktop,
  columnIndex: number,
  removedTileIndex: number,
): Desktop {
  const column = desktop.columns[columnIndex];
  if (column === undefined || column.tiles.length === 0) return clearFocus(desktop);
  const tile = column.tiles[Math.min(removedTileIndex, column.tiles.length - 1)];
  if (tile === undefined) return clearFocus(desktop);
  return { ...desktop, focused: { columnId: column.id, tileId: tile.id } };
}

function refocusAfterColumnRemoval(desktop: Desktop, removedColumnIndex: number): Desktop {
  if (desktop.columns.length === 0) return clearFocus(desktop);
  const column = desktop.columns[Math.min(removedColumnIndex, desktop.columns.length - 1)];
  const tile = column?.tiles[0];
  if (column === undefined || tile === undefined) return clearFocus(desktop);
  return { ...desktop, focused: { columnId: column.id, tileId: tile.id } };
}

function resolveDesktopIndex(state: LayoutState, desktopId?: DesktopId): number {
  return requireDesktopIndex(state, desktopId ?? state.activeDesktopId);
}

function requireDesktopIndex(state: LayoutState, desktopId: DesktopId): number {
  const index = state.desktops.findIndex((desktop) => desktop.id === desktopId);
  if (index < 0) throw new Error(`Desktop not found: ${desktopId}`);
  return index;
}

function findColumn(
  state: LayoutState,
  columnId: ColumnId,
  desktopId?: DesktopId,
): ColumnLocation | undefined {
  for (const desktopIndex of searchDesktopIndexes(state, desktopId)) {
    const columnIndex = desktopAt(state, desktopIndex).columns.findIndex(
      (column) => column.id === columnId,
    );
    if (columnIndex >= 0) return { desktopIndex, columnIndex };
  }
  return undefined;
}

function requireColumn(
  state: LayoutState,
  columnId: ColumnId,
  desktopId?: DesktopId,
): ColumnLocation {
  if (desktopId !== undefined) requireDesktopIndex(state, desktopId);
  const location = findColumn(state, columnId, desktopId);
  if (location === undefined) throw new Error(`Column not found: ${columnId}`);
  return location;
}

function findTile(
  state: LayoutState,
  tileId: TileId,
  desktopId?: DesktopId,
): TileLocation | undefined {
  for (const desktopIndex of searchDesktopIndexes(state, desktopId)) {
    const desktop = desktopAt(state, desktopIndex);
    for (let columnIndex = 0; columnIndex < desktop.columns.length; columnIndex += 1) {
      const column = desktop.columns[columnIndex];
      if (column === undefined) continue;
      const tileIndex = column.tiles.findIndex((tile) => tile.id === tileId);
      if (tileIndex >= 0) return { desktopIndex, columnIndex, tileIndex };
    }
  }
  return undefined;
}

function requireTile(state: LayoutState, tileId: TileId, desktopId?: DesktopId): TileLocation {
  if (desktopId !== undefined) requireDesktopIndex(state, desktopId);
  const location = findTile(state, tileId, desktopId);
  if (location === undefined) throw new Error(`Tile not found: ${tileId}`);
  return location;
}

function searchDesktopIndexes(state: LayoutState, desktopId?: DesktopId): number[] {
  if (desktopId === undefined) return state.desktops.map((_, index) => index);
  const index = state.desktops.findIndex((desktop) => desktop.id === desktopId);
  return index < 0 ? [] : [index];
}

function resolveOpenColumnIndex(desktop: Desktop, options?: OpenTileOptions): number | undefined {
  if (options?.columnId !== undefined) {
    const index = desktop.columns.findIndex((column) => column.id === options.columnId);
    if (index < 0) throw new Error(`Column not found: ${options.columnId}`);
    return index;
  }
  if (desktop.focused === undefined) return undefined;
  const focusedColumnId = desktop.focused.columnId;
  const index = desktop.columns.findIndex((column) => column.id === focusedColumnId);
  if (index < 0) throw new Error(`Column not found: ${focusedColumnId}`);
  return index;
}

function assertDesktopName(name: string): void {
  if (name.trim() === '') throw new Error('Desktop name must not be empty');
}

function assertComponentId(componentId: string): void {
  if (componentId.trim() === '') throw new Error('componentId must not be empty');
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite number greater than 0`);
  }
}

function assertDesktopOrder(order: number, count: number): void {
  if (!Number.isInteger(order) || order < 1 || order > count) {
    throw new Error(`Desktop order out of range: ${order}`);
  }
}

function assertTilePosition(position: number, count: number): void {
  if (!Number.isInteger(position) || position < 0 || position >= count) {
    throw new Error(`Tile position out of range: ${position}`);
  }
}

function assertInsertIndex(index: number, length: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index > length) {
    throw new Error(`${label} out of range: ${index}`);
  }
}
