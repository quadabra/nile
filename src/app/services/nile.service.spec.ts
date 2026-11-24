import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LayoutEngine } from '../../core/layout-engine';
import { NileService } from './nile.service';

describe('NileService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  async function stableService(): Promise<NileService> {
    const nile = TestBed.inject(NileService);
    await TestBed.inject(ApplicationRef).whenStable();
    return nile;
  }

  it('starts with one desktop and updates the signal when tiles change', async () => {
    const nile = await stableService();

    expect(nile.desktops()).toHaveLength(1);
    expect(nile.activeDesktop()?.columns).toEqual([]);

    nile.openTile('panel');
    const tile = nile.activeDesktop()?.columns[0]?.tiles[0];
    expect(tile?.componentId).toBe('panel');

    nile.createDesktop('notes');
    expect(nile.desktops().map((desktop) => desktop.name)).toEqual(['1', 'notes']);
    expect(nile.activeDesktop()?.name).toBe('1');

    const notes = nile.desktops()[1];
    if (notes === undefined) throw new Error('missing desktop');
    nile.switchDesktop(notes.id);
    expect(nile.activeDesktop()?.name).toBe('notes');

    nile.switchDesktop(nile.desktops()[0]?.id ?? '');
    const openTile = nile.activeDesktop()?.columns[0]?.tiles[0];
    if (openTile === undefined) throw new Error('missing tile');
    nile.closeTile(openTile.id);
    expect(nile.activeDesktop()?.columns).toEqual([]);
  });

  it('saves the layout and restores it for a new service', async () => {
    const first = await stableService();
    first.createDesktop('notes');
    first.openTile('editor');
    first.switchDesktop(first.desktops()[1]?.id ?? '');
    expect(localStorage.getItem('nile-layout')).toContain('editor');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const second = TestBed.inject(NileService);
    expect(second.desktops()).toHaveLength(1);

    await TestBed.inject(ApplicationRef).whenStable();
    expect(second.desktops().map((desktop) => desktop.name)).toEqual(['1', 'notes']);
    expect(second.activeDesktop()?.name).toBe('notes');
    expect(second.desktops()[0]?.columns[0]?.tiles[0]?.componentId).toBe('editor');
  });

  it('ignores a broken snapshot', async () => {
    localStorage.setItem('nile-layout', '{not json');
    const nile = await stableService();

    expect(nile.desktops()).toHaveLength(1);
    expect(nile.activeDesktop()?.name).toBe('1');
    expect(nile.activeDesktop()?.columns).toEqual([]);
  });

  it('keeps the layout when localStorage rejects the write', async () => {
    const nile = await stableService();
    const setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new Error('denied');
    };
    try {
      expect(() => nile.openTile('panel')).not.toThrow();
    } finally {
      localStorage.setItem = setItem;
    }
    expect(nile.activeDesktop()?.columns[0]?.tiles[0]?.componentId).toBe('panel');
  });

  it('roundtrips a placed layout through the stored snapshot', async () => {
    let state = LayoutEngine.createInitialState('main');
    state = LayoutEngine.openTile(state, 'top');
    state = LayoutEngine.openTile(state, 'bottom', { height: 2 });
    state = LayoutEngine.openTile(state, 'side');
    const side = state.desktops[0]?.columns[0]?.tiles.find((tile) => tile.componentId === 'side');
    const bottom = state.desktops[0]?.columns[0]?.tiles.find(
      (tile) => tile.componentId === 'bottom',
    );
    if (side === undefined || bottom === undefined) throw new Error('missing tile');
    state = LayoutEngine.placeTile(state, side.id, { tileId: bottom.id, edge: 'right' });
    localStorage.setItem('nile-layout', JSON.stringify(LayoutEngine.toJSON(state)));

    const nile = await stableService();
    const tiles = nile.activeDesktop()?.columns[0]?.tiles ?? [];
    expect(tiles.map((tile) => [tile.componentId, tile.row, tile.width, tile.height])).toEqual([
      ['top', 0, 1, 1],
      ['bottom', 1, 0.5, 2],
      ['side', 1, 0.5, 2],
    ]);
  });
});
