import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { TileDropEdge, TileDropTarget, TileId } from '../../core/types';
import { NileService } from './nile.service';

export interface DropPreview {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DragSession {
  tileId: TileId;
  pointerId: number;
  originX: number;
  originY: number;
  armed: boolean;
  target: TileDropTarget | null;
  preview: DropPreview | null;
}

const DRAG_THRESHOLD_PX = 4;

/** Перетаскивание тайла: зона у края цели показывает, куда он встанет. */
@Injectable({ providedIn: 'root' })
export class TileDragService {
  private readonly document = inject(DOCUMENT);
  private readonly nile = inject(NileService);
  private readonly session = signal<DragSession | null>(null);

  readonly sourceId = computed(() => this.session()?.tileId ?? null);
  readonly preview = computed(() => this.session()?.preview ?? null);

  begin(tileId: TileId, event: PointerEvent): void {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement)) return;
    this.session.set({
      tileId,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      armed: false,
      target: null,
      preview: null,
    });
    handle.setPointerCapture(event.pointerId);
  }

  move(event: PointerEvent): void {
    const session = this.session();
    if (session === null || event.pointerId !== session.pointerId) return;

    const distance = Math.hypot(event.clientX - session.originX, event.clientY - session.originY);
    if (!session.armed && distance < DRAG_THRESHOLD_PX) return;

    const hit = dropHit(this.document, event.clientX, event.clientY, session.tileId);
    if (!session.armed) {
      this.document.body.style.cursor = 'grabbing';
      this.document.body.style.userSelect = 'none';
    }
    this.session.set({
      ...session,
      armed: true,
      target: hit?.target ?? null,
      preview: hit?.preview ?? null,
    });
  }

  /** Возвращает true, если жест был переносом, а не кликом. */
  end(event: PointerEvent): boolean {
    const session = this.session();
    if (session === null || event.pointerId !== session.pointerId) return false;
    this.session.set(null);
    this.clearDragCursor();
    if (!session.armed) return false;
    if (session.target !== null) this.nile.placeTile(session.tileId, session.target);
    return true;
  }

  cancel(): void {
    if (this.session() === null) return;
    this.session.set(null);
    this.clearDragCursor();
  }

  private clearDragCursor(): void {
    this.document.body.style.cursor = '';
    this.document.body.style.userSelect = '';
  }
}

interface DropHit {
  target: TileDropTarget;
  preview: DropPreview;
}

function dropHit(
  documentRef: Document,
  clientX: number,
  clientY: number,
  sourceId: TileId,
): DropHit | null {
  const elements = documentRef.elementsFromPoint(clientX, clientY);
  for (const element of elements) {
    if (!(element instanceof Element)) continue;
    const tile = element.closest('[data-tile-id]');
    const tileId = tile?.getAttribute('data-tile-id');
    if (
      !(tile instanceof HTMLElement) ||
      tileId === null ||
      tileId === undefined ||
      tileId === ''
    ) {
      continue;
    }
    if (tileId === sourceId) continue;
    const edge = dropEdge(tile.getBoundingClientRect(), clientX, clientY);
    return { target: { tileId, edge }, preview: previewBox(tile, edge) };
  }
  return null;
}

/** Четыре треугольника: ближайший край тайла — сторона, которую займёт панель. */
export function dropEdge(rect: DOMRect, clientX: number, clientY: number): TileDropEdge {
  if (rect.width <= 0 || rect.height <= 0) return 'below';
  const x = (clientX - rect.left) / rect.width - 0.5;
  const y = (clientY - rect.top) / rect.height - 0.5;
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'above' : 'below';
}

function previewBox(tile: HTMLElement, edge: TileDropEdge): DropPreview {
  if (edge === 'left' || edge === 'right') {
    const rect = tile.getBoundingClientRect();
    const width = rect.width / 2;
    return {
      top: rect.top,
      left: edge === 'left' ? rect.left : rect.right - width,
      width,
      height: rect.height,
    };
  }

  const row = tile.closest('[data-row]');
  const rect = (row instanceof HTMLElement ? row : tile).getBoundingClientRect();
  const height = rect.height / 2;
  return {
    top: edge === 'above' ? rect.top : rect.bottom - height,
    left: rect.left,
    width: rect.width,
    height,
  };
}
