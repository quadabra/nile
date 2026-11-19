/**
 * NILE Core Types
 * Nested Interface Layout Engine
 *
 * Desktop — горизонтальный ряд колонок.
 * Column — вертикальный стек тайлов и их общая ширина.
 * Tile — панель внутри колонки: размер (высота) и положение (индекс).
 */

export type TileId = string;
export type ColumnId = string;
export type DesktopId = string;

/** Тайл (панель) внутри колонки. Ширину задаёт колонка. */
export interface Tile {
  id: TileId;
  /** Идентификатор Angular-компонента для рендера */
  componentId: string;
  /** Размер: относительная высота внутри колонки */
  height: number;
  /**
   * Положение в колонке, индекс с нуля.
   * Совпадает с позицией в `Column.tiles`.
   */
  position: number;
  /** Дополнительные данные, передаваемые в компонент */
  props?: Record<string, unknown>;
  minHeight?: number;
}

/** Колонка внутри десктопа (вертикальный стек тайлов) */
export interface Column {
  id: ColumnId;
  /** Относительная ширина колонки */
  width: number;
  tiles: Tile[];
  minWidth?: number;
}

/** Один рабочий стол (горизонтальный скролл колонок) */
export interface Desktop {
  id: DesktopId;
  /**
   * Порядковый номер, начиная с 1.
   * Совпадает с позицией в `LayoutState.desktops`.
   */
  order: number;
  /** Отображаемое имя или номер */
  name: string;
  columns: Column[];
  focused?: {
    columnId: ColumnId;
    tileId: TileId;
  };
}

/** Полное состояние раскладки */
export interface LayoutState {
  desktops: Desktop[];
  activeDesktopId: DesktopId;
}

/** Опции открытия нового тайла */
export interface OpenTileOptions {
  desktopId?: DesktopId;
  /** Если не указано — в focused колонку или новая колонка */
  columnId?: ColumnId;
  /** Позиция внутри колонки (по умолчанию — в конец) */
  index?: number;
  props?: Record<string, unknown>;
  /** Размер тайла. По умолчанию 1. */
  height?: number;
}

/** Опции создания колонки */
export interface CreateColumnOptions {
  desktopId?: DesktopId;
  /** Относительная ширина. По умолчанию 1. */
  width?: number;
  minWidth?: number;
  /** Индекс вставки. По умолчанию — в конец. */
  index?: number;
}

/** Изменение десктопа. `order` — новая позиция с 1, остальные номера пересчитываются. */
export interface DesktopPatch {
  name?: string;
  order?: number;
}

/** Изменение колонки */
export interface ColumnPatch {
  width?: number;
  minWidth?: number;
}

/** Изменение тайла. `position` перемещает тайл внутри своей колонки. */
export interface TilePatch {
  componentId?: string;
  height?: number;
  position?: number;
  props?: Record<string, unknown>;
  minHeight?: number;
}

/** Цель перемещения тайла */
export interface MoveTileTarget {
  desktopId?: DesktopId;
  columnId?: ColumnId;
  /** Индекс внутри целевой колонки */
  index?: number;
  /** Специальные направления */
  direction?: 'left' | 'right' | 'up' | 'down' | 'new-column';
}
