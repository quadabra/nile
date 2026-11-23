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

type MovePlan =
  | {
      kind: 'column';
      desktopIndex: number;
      columnId: ColumnId;
      tileIndex: number;
    }
  | {
      kind: 'new-column';
      desktopIndex: number;
      newColumnIndex: number;
      tileIndex: number;
    };

interface MoveAnchor {
  desktopIndex: number;
  columnIndex?: number;
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
   * Перемещает тайл внутри колонки, в другую колонку, в новый столбец или на другой десктоп.
   *
   * `columnId` и `index` задают место напрямую. Без `index` тайл остаётся на своём
   * месте в той же колонке и добавляется в конец чужой. `desktopId` выбирает десктоп;
   * на пустом десктопе тайл встаёт в новую колонку.
   *
   * `direction: 'up' | 'down'` сдвигает тайл на одну позицию. Переданный `index`
   * заменяет этот шаг. `'left' | 'right'` переносят в соседнюю колонку того же
   * десктопа, сохраняя ряд, если в ней хватает места. На другом десктопе они
   * создают колонку слева или справа. `'new-column'`
   * выделяет тайл в столбец справа от текущего. Если тайл уже один в колонке
   * и столбец оказался бы на том же месте, возвращается тот же `state`.
   *
   * Край без соседней колонки и шаг за границей колонки тоже не меняют состояние.
   * Несуществующие десктоп, колонка и тайл дают ошибку.
   *
   * Фокус следует за тайлом, только если перемещали сфокусированный тайл.
   * Когда он уходит на другой десктоп, на прежнем фокус переходит к соседу,
   * как при `closeTile`. Активный десктоп не переключается.
   */
  static moveTile(state: LayoutState, tileId: TileId, target: MoveTileTarget): LayoutState {
    const source = requireTile(state, tileId);
    const plan = planMove(state, source, target);
    if (plan === undefined) return state;
    return commitMove(state, source, plan);
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
   * Сериализует состояние в plain object для `JSON.stringify`.
   * Возвращает копию: поля `state` и вложенные `props` не разделяются с результатом.
   */
  static toJSON(state: LayoutState): unknown {
    return toPlainJson(serializeState(state));
  }

  /**
   * Восстанавливает состояние из plain object или результата `JSON.parse`.
   * Проверяет структуру, типы и ссылки между id.
   * `order` десктопов и `position` тайлов выставляет по фактическому порядку элементов.
   *
   * @throws Если данные не являются корректным состоянием раскладки.
   */
  static fromJSON(data: unknown): LayoutState {
    return parseLayoutState(data);
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

function planMove(
  state: LayoutState,
  source: TileLocation,
  target: MoveTileTarget,
): MovePlan | undefined {
  const anchor = resolveMoveAnchor(state, source, target);
  if (target.direction !== undefined) return planDirection(state, source, target, anchor);
  return planExplicit(state, source, target, anchor);
}

function resolveMoveAnchor(
  state: LayoutState,
  source: TileLocation,
  target: MoveTileTarget,
): MoveAnchor {
  if (target.columnId !== undefined) {
    const location = requireColumn(state, target.columnId, target.desktopId);
    return { desktopIndex: location.desktopIndex, columnIndex: location.columnIndex };
  }
  if (target.desktopId !== undefined) {
    const desktopIndex = requireDesktopIndex(state, target.desktopId);
    if (desktopIndex === source.desktopIndex) {
      return { desktopIndex, columnIndex: source.columnIndex };
    }
    return { desktopIndex };
  }
  return { desktopIndex: source.desktopIndex, columnIndex: source.columnIndex };
}

function planExplicit(
  state: LayoutState,
  source: TileLocation,
  target: MoveTileTarget,
  anchor: MoveAnchor,
): MovePlan | undefined {
  const desktop = desktopAt(state, anchor.desktopIndex);
  const sameDesktop = anchor.desktopIndex === source.desktopIndex;

  if (anchor.columnIndex === undefined) {
    if (sameDesktop && target.index === undefined) return undefined;
    if (desktop.columns.length === 0) return planFreshColumn(anchor.desktopIndex, 0, target.index);
    const column = columnAt(desktop, landingColumnIndex(desktop));
    return planIntoColumn(source, anchor.desktopIndex, column, target.index, false);
  }

  const column = columnAt(desktop, anchor.columnIndex);
  const sameColumn = sameDesktop && column.id === sourceColumn(state, source).id;
  return planIntoColumn(source, anchor.desktopIndex, column, target.index, sameColumn);
}

function planDirection(
  state: LayoutState,
  source: TileLocation,
  target: MoveTileTarget,
  anchor: MoveAnchor,
): MovePlan | undefined {
  switch (target.direction) {
    case 'up':
    case 'down':
      return planVertical(state, source, target, anchor, target.direction);
    case 'left':
    case 'right':
      return planHorizontal(state, source, target, anchor, target.direction);
    case 'new-column':
      return planNewColumn(state, source, target, anchor);
    case undefined:
      return undefined;
    default:
      return assertNever(target.direction);
  }
}

function planVertical(
  state: LayoutState,
  source: TileLocation,
  target: MoveTileTarget,
  anchor: MoveAnchor,
  direction: 'up' | 'down',
): MovePlan | undefined {
  const desktop = desktopAt(state, anchor.desktopIndex);
  const columnIndex =
    anchor.columnIndex ??
    (desktop.columns.length === 0 ? undefined : verticalColumnIndex(desktop, direction));
  if (columnIndex === undefined) return planFreshColumn(anchor.desktopIndex, 0, target.index);

  const column = columnAt(desktop, columnIndex);
  const sameColumn =
    anchor.desktopIndex === source.desktopIndex && column.id === sourceColumn(state, source).id;
  if (target.index !== undefined || !sameColumn) {
    const tileIndex = target.index ?? (direction === 'up' ? 0 : column.tiles.length);
    return planIntoColumn(source, anchor.desktopIndex, column, tileIndex, sameColumn);
  }

  const next = source.tileIndex + (direction === 'up' ? -1 : 1);
  if (next < 0 || next >= column.tiles.length) return undefined;
  return {
    kind: 'column',
    desktopIndex: anchor.desktopIndex,
    columnId: column.id,
    tileIndex: next,
  };
}

function planHorizontal(
  state: LayoutState,
  source: TileLocation,
  target: MoveTileTarget,
  anchor: MoveAnchor,
  direction: 'left' | 'right',
): MovePlan | undefined {
  const desktop = desktopAt(state, anchor.desktopIndex);
  const enteringDesktop =
    anchor.desktopIndex !== source.desktopIndex && anchor.columnIndex === undefined;
  if (enteringDesktop) {
    const newColumnIndex = direction === 'left' ? 0 : desktop.columns.length;
    return planFreshColumn(anchor.desktopIndex, newColumnIndex, target.index);
  }

  const columnIndex = anchor.columnIndex ?? source.columnIndex;
  const neighborIndex = columnIndex + (direction === 'left' ? -1 : 1);
  const neighbor = desktop.columns[neighborIndex];
  if (neighbor === undefined) return undefined;

  const tileIndex = target.index ?? Math.min(source.tileIndex, neighbor.tiles.length);
  const sameColumn =
    anchor.desktopIndex === source.desktopIndex && neighbor.id === sourceColumn(state, source).id;
  return planIntoColumn(source, anchor.desktopIndex, neighbor, tileIndex, sameColumn);
}

function planNewColumn(
  state: LayoutState,
  source: TileLocation,
  target: MoveTileTarget,
  anchor: MoveAnchor,
): MovePlan | undefined {
  const desktop = desktopAt(state, anchor.desktopIndex);
  const sameDesktop = anchor.desktopIndex === source.desktopIndex;
  const sourceAlone = sourceColumn(state, source).tiles.length === 1;

  if (!sameDesktop && anchor.columnIndex === undefined) {
    return planFreshColumn(anchor.desktopIndex, desktop.columns.length, target.index);
  }

  const anchorIndex = anchor.columnIndex ?? source.columnIndex;
  let newColumnIndex = anchorIndex + 1;
  // Удаление исходной колонки сдвигает индексы справа от неё.
  if (sameDesktop && sourceAlone && source.columnIndex < newColumnIndex) newColumnIndex -= 1;
  if (sameDesktop && sourceAlone && newColumnIndex === source.columnIndex) return undefined;
  return planFreshColumn(anchor.desktopIndex, newColumnIndex, target.index);
}

function planFreshColumn(
  desktopIndex: number,
  newColumnIndex: number,
  tileIndex: number | undefined,
): MovePlan {
  const index = tileIndex ?? 0;
  assertInsertIndex(index, 0, 'Tile index');
  return { kind: 'new-column', desktopIndex, newColumnIndex, tileIndex: index };
}

function planIntoColumn(
  source: TileLocation,
  desktopIndex: number,
  column: Column,
  index: number | undefined,
  sameColumn: boolean,
): MovePlan | undefined {
  if (sameColumn) {
    const tileIndex = index ?? source.tileIndex;
    assertInsertIndex(tileIndex, Math.max(column.tiles.length - 1, 0), 'Tile index');
    if (tileIndex === source.tileIndex) return undefined;
    return { kind: 'column', desktopIndex, columnId: column.id, tileIndex };
  }

  const tileIndex = index ?? column.tiles.length;
  assertInsertIndex(tileIndex, column.tiles.length, 'Tile index');
  return { kind: 'column', desktopIndex, columnId: column.id, tileIndex };
}

function landingColumnIndex(desktop: Desktop): number {
  if (desktop.focused !== undefined) {
    const focusedIndex = desktop.columns.findIndex(
      (column) => column.id === desktop.focused?.columnId,
    );
    if (focusedIndex >= 0) return focusedIndex;
  }
  return Math.max(desktop.columns.length - 1, 0);
}

function verticalColumnIndex(desktop: Desktop, direction: 'up' | 'down'): number {
  return direction === 'up' ? 0 : desktop.columns.length - 1;
}

function sourceColumn(state: LayoutState, source: TileLocation): Column {
  return columnAt(desktopAt(state, source.desktopIndex), source.columnIndex);
}

function commitMove(state: LayoutState, source: TileLocation, plan: MovePlan): LayoutState {
  const sourceDesktop = desktopAt(state, source.desktopIndex);
  const origin = sourceColumn(state, source);
  const tile = tileAt(sourceDesktop, source);
  const movedWasFocused = sourceDesktop.focused?.tileId === tile.id;
  const sameDesktop = plan.desktopIndex === source.desktopIndex;

  const remaining = withPositions(origin.tiles.filter((item) => item.id !== tile.id));
  const sourceColumnRemoved = remaining.length === 0;
  const sourceColumns = sourceDesktop.columns.slice();
  if (sourceColumnRemoved) sourceColumns.splice(source.columnIndex, 1);
  else sourceColumns[source.columnIndex] = { ...origin, tiles: remaining };

  const destDesktop = sameDesktop ? sourceDesktop : desktopAt(state, plan.desktopIndex);
  const destColumns = sameDesktop ? sourceColumns : destDesktop.columns.slice();
  const landingColumnId = insertMovedTile(destColumns, tile, plan);

  let nextSource = { ...sourceDesktop, columns: sourceColumns };
  if (movedWasFocused && sameDesktop) {
    nextSource = { ...nextSource, focused: { columnId: landingColumnId, tileId: tile.id } };
  } else if (movedWasFocused) {
    nextSource = sourceColumnRemoved
      ? refocusAfterColumnRemoval(nextSource, source.columnIndex)
      : refocusAfterTileRemoval(nextSource, source.columnIndex, source.tileIndex);
  }

  if (sameDesktop) return withDesktop(state, source.desktopIndex, nextSource);

  const nextDest = movedWasFocused
    ? {
        ...destDesktop,
        columns: destColumns,
        focused: { columnId: landingColumnId, tileId: tile.id },
      }
    : { ...destDesktop, columns: destColumns };

  const desktops = state.desktops.slice();
  desktops[source.desktopIndex] = nextSource;
  desktops[plan.desktopIndex] = nextDest;
  return { activeDesktopId: state.activeDesktopId, desktops };
}

function insertMovedTile(columns: Column[], tile: Tile, plan: MovePlan): ColumnId {
  if (plan.kind === 'new-column') {
    const created = createColumnEntity(DEFAULT_COLUMN_WIDTH);
    const column: Column = { ...created, tiles: withPositions([tile]) };
    columns.splice(plan.newColumnIndex, 0, column);
    return created.id;
  }

  const columnIndex = columns.findIndex((column) => column.id === plan.columnId);
  const column = columns[columnIndex];
  if (column === undefined) throw new Error(`Column not found: ${plan.columnId}`);
  const tiles = column.tiles.slice();
  tiles.splice(plan.tileIndex, 0, tile);
  columns[columnIndex] = { ...column, tiles: withPositions(tiles) };
  return column.id;
}

function assertNever(value: never): never {
  throw new Error(`Unknown move direction: ${String(value)}`);
}

interface SerializedTile {
  id: string;
  componentId: string;
  height: number;
  position: number;
  props?: Record<string, unknown>;
  minHeight?: number;
}

interface SerializedColumn {
  id: string;
  width: number;
  tiles: SerializedTile[];
  minWidth?: number;
}

interface SerializedDesktop {
  id: string;
  order: number;
  name: string;
  columns: SerializedColumn[];
  focused?: {
    columnId: string;
    tileId: string;
  };
}

interface SerializedLayout {
  desktops: SerializedDesktop[];
  activeDesktopId: string;
}

interface ParseIds {
  desktops: Set<string>;
  columns: Set<string>;
  tiles: Set<string>;
}

function serializeState(state: LayoutState): SerializedLayout {
  return {
    activeDesktopId: state.activeDesktopId,
    desktops: state.desktops.map((desktop) => serializeDesktop(desktop)),
  };
}

function serializeDesktop(desktop: Desktop): SerializedDesktop {
  const serialized: SerializedDesktop = {
    id: desktop.id,
    order: desktop.order,
    name: desktop.name,
    columns: desktop.columns.map((column) => serializeColumn(column)),
  };
  if (desktop.focused !== undefined) {
    serialized.focused = {
      columnId: desktop.focused.columnId,
      tileId: desktop.focused.tileId,
    };
  }
  return serialized;
}

function serializeColumn(column: Column): SerializedColumn {
  const serialized: SerializedColumn = {
    id: column.id,
    width: column.width,
    tiles: column.tiles.map((tile) => serializeTile(tile)),
  };
  if (column.minWidth !== undefined) serialized.minWidth = column.minWidth;
  return serialized;
}

function serializeTile(tile: Tile): SerializedTile {
  const serialized: SerializedTile = {
    id: tile.id,
    componentId: tile.componentId,
    height: tile.height,
    position: tile.position,
  };
  if (tile.props !== undefined) serialized.props = tile.props;
  if (tile.minHeight !== undefined) serialized.minHeight = tile.minHeight;
  return serialized;
}

function toPlainJson(value: SerializedLayout): unknown {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error('Layout state must be JSON-serializable');
  return JSON.parse(text) as unknown;
}

function parseLayoutState(data: unknown): LayoutState {
  const record = readRecord(data, 'Layout state');
  const ids: ParseIds = { desktops: new Set(), columns: new Set(), tiles: new Set() };
  const desktops = readArray(record['desktops'], 'Layout state desktops').map((item, index) =>
    parseDesktop(item, index, ids),
  );
  if (desktops.length === 0) throw new Error('Layout state must contain at least one desktop');

  const activeDesktopId = readId(record['activeDesktopId'], 'Active desktop id');
  if (!desktops.some((desktop) => desktop.id === activeDesktopId)) {
    throw new Error(`Desktop not found: ${activeDesktopId}`);
  }
  return { activeDesktopId, desktops: withOrders(desktops) };
}

function parseDesktop(data: unknown, index: number, ids: ParseIds): Desktop {
  const record = readRecord(data, `Desktop at index ${index}`);
  const id = readId(record['id'], 'Desktop id');
  trackId(ids.desktops, id, 'desktop');
  const name = readString(record['name'], 'Desktop name');
  assertDesktopName(name);
  readOptionalFinite(record['order'], 'Desktop order');

  const columns = readArray(record['columns'], 'Desktop columns').map((item, columnIndex) =>
    parseColumn(item, columnIndex, ids),
  );
  const focused = readFocus(record['focused'], columns);
  const desktop: Desktop = { id, order: 0, name, columns };
  if (focused !== undefined) desktop.focused = focused;
  return desktop;
}

function parseColumn(data: unknown, index: number, ids: ParseIds): Column {
  const record = readRecord(data, `Column at index ${index}`);
  const id = readId(record['id'], 'Column id');
  trackId(ids.columns, id, 'column');
  const width = readPositive(record['width'], 'Column width');
  const minWidth = readOptionalPositive(record['minWidth'], 'Column minWidth');
  if (minWidth !== undefined && width < minWidth) {
    throw new Error('Column width must not be less than minWidth');
  }

  const tiles = withPositions(
    readArray(record['tiles'], 'Column tiles').map((item, tileIndex) =>
      parseTile(item, tileIndex, ids),
    ),
  );
  const column: Column = { id, width, tiles };
  if (minWidth !== undefined) column.minWidth = minWidth;
  return column;
}

function parseTile(data: unknown, index: number, ids: ParseIds): Tile {
  const record = readRecord(data, `Tile at index ${index}`);
  const id = readId(record['id'], 'Tile id');
  trackId(ids.tiles, id, 'tile');
  const componentId = readString(record['componentId'], 'componentId');
  assertComponentId(componentId);
  const height = readPositive(record['height'], 'Tile height');
  const minHeight = readOptionalPositive(record['minHeight'], 'Tile minHeight');
  if (minHeight !== undefined && height < minHeight) {
    throw new Error('Tile height must not be less than minHeight');
  }
  readOptionalFinite(record['position'], 'Tile position');

  const tile: Tile = { id, componentId, height, position: index };
  if (minHeight !== undefined) tile.minHeight = minHeight;
  if (record['props'] !== undefined) tile.props = readProps(record['props']);
  return tile;
}

function readFocus(value: unknown, columns: readonly Column[]): Desktop['focused'] {
  if (value === undefined) return undefined;
  const record = readRecord(value, 'Desktop focus');
  const columnId = readId(record['columnId'], 'Focus column id');
  const tileId = readId(record['tileId'], 'Focus tile id');
  const column = columns.find((item) => item.id === columnId);
  if (column === undefined) throw new Error(`Column not found: ${columnId}`);
  if (!column.tiles.some((tile) => tile.id === tileId))
    throw new Error(`Tile not found: ${tileId}`);
  return { columnId, tileId };
}

function readProps(value: unknown): Record<string, unknown> {
  const record = readRecord(value, 'Tile props');
  return cloneJsonObject(record, 'Tile props');
}

function cloneJsonObject(value: Record<string, unknown>, label: string): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: cloneJsonValue(value[key], `${label}.${key}`),
    });
  }
  return copy;
}

function cloneJsonValue(value: unknown, label: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must be JSON-serializable`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneJsonValue(item, `${label}[${index}]`));
  }
  if (isRecord(value)) return cloneJsonObject(value, label);
  throw new Error(`${label} must be JSON-serializable`);
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function readId(value: unknown, label: string): string {
  const id = readString(value, label);
  if (id.trim() === '') throw new Error(`${label} must not be empty`);
  return id;
}

function readPositive(value: unknown, label: string): number {
  if (typeof value !== 'number') throw new Error(`${label} must be a finite number greater than 0`);
  assertPositive(value, label);
  return value;
}

function readOptionalPositive(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  return readPositive(value, label);
}

function readOptionalFinite(value: unknown, label: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function trackId(ids: Set<string>, id: string, label: string): void {
  if (ids.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
  ids.add(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
