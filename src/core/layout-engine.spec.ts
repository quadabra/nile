import { LayoutEngine } from './layout-engine';
import { Column, Desktop, LayoutState, Tile } from './types';

function freeze<T>(value: T): T {
  freezeDeep(value);
  return value;
}

function freezeDeep(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) freezeDeep(nested);
}

function desktopAt(state: LayoutState, index = 0): Desktop {
  const desktop = state.desktops[index];
  if (desktop === undefined) throw new Error(`missing desktop ${index}`);
  return desktop;
}

function columnAt(desktop: Desktop, index = 0): Column {
  const column = desktop.columns[index];
  if (column === undefined) throw new Error(`missing column ${index}`);
  return column;
}

function tileAt(column: Column, index = 0): Tile {
  const tile = column.tiles[index];
  if (tile === undefined) throw new Error(`missing tile ${index}`);
  return tile;
}

function componentsOf(state: LayoutState, desktopIndex = 0): string[][] {
  return desktopAt(state, desktopIndex).columns.map((column) =>
    column.tiles.map((tile) => tile.componentId),
  );
}

function tileByComponent(state: LayoutState, componentId: string, desktopIndex = 0): Tile {
  for (const column of desktopAt(state, desktopIndex).columns) {
    const tile = column.tiles.find((item) => item.componentId === componentId);
    if (tile !== undefined) return tile;
  }
  throw new Error(`missing tile ${componentId}`);
}

function expectShape(state: LayoutState): void {
  expect(state.desktops.length).toBeGreaterThan(0);
  expect(state.desktops.map((desktop) => desktop.order)).toEqual(
    state.desktops.map((_, index) => index + 1),
  );
  expect(state.desktops.some((desktop) => desktop.id === state.activeDesktopId)).toBe(true);
  for (const desktop of state.desktops) {
    for (const column of desktop.columns) {
      expect(column.width).toBeGreaterThan(0);
      expect(column.tiles.map((tile) => tile.position)).toEqual(
        column.tiles.map((_, index) => index),
      );
      let previousRow = -1;
      const rowHeight = new Map<number, number>();
      for (const tile of column.tiles) {
        expect(tile.width).toBeGreaterThan(0);
        expect(tile.height).toBeGreaterThan(0);
        expect(tile.row).toBeGreaterThanOrEqual(previousRow);
        if (tile.row !== previousRow) expect(tile.row).toBe(previousRow + 1);
        previousRow = tile.row;
        const height = rowHeight.get(tile.row);
        if (height === undefined) rowHeight.set(tile.row, tile.height);
        else expect(tile.height).toBe(height);
      }
    }
  }
}

describe('LayoutEngine desktops', () => {
  it('creates one empty active desktop', () => {
    const state = LayoutEngine.createInitialState();

    expect(state.desktops).toHaveLength(1);
    const desktop = desktopAt(state);
    expect(desktop.order).toBe(1);
    expect(desktop.name).toBe('1');
    expect(desktop.columns).toEqual([]);
    expect(desktop.id).toMatch(/^dsk-/);
    expect(state.activeDesktopId).toBe(desktop.id);
    expect(LayoutEngine.getDesktop(state, desktop.id)).toBe(desktop);
    expectShape(state);
  });

  it('accepts an initial desktop name', () => {
    const desktop = desktopAt(LayoutEngine.createInitialState('work'));
    expect(desktop.name).toBe('work');
    expect(desktop.order).toBe(1);
  });

  it('rejects an empty initial name', () => {
    expect(() => LayoutEngine.createInitialState('   ')).toThrow('Desktop name must not be empty');
  });

  it('creates a desktop without activating it', () => {
    const initial = freeze(LayoutEngine.createInitialState('main'));
    const state = LayoutEngine.createDesktop(initial, 'notes');

    expect(initial.desktops).toHaveLength(1);
    expect(state.activeDesktopId).toBe(initial.activeDesktopId);
    expect(state.desktops).toHaveLength(2);
    expect(desktopAt(state, 1).name).toBe('notes');
    expect(desktopAt(state, 1).order).toBe(2);
    expect(desktopAt(state, 0)).toBe(desktopAt(initial, 0));
    expectShape(state);
  });

  it('names a desktop after its order when the name is omitted', () => {
    const state = LayoutEngine.createDesktop(LayoutEngine.createInitialState());
    expect(desktopAt(state, 1).name).toBe('2');
  });

  it('renames a desktop and can move it by order', () => {
    let state = LayoutEngine.createInitialState('a');
    state = LayoutEngine.createDesktop(state, 'b');
    state = LayoutEngine.createDesktop(state, 'c');
    const second = desktopAt(state, 1);
    const third = desktopAt(state, 2);

    state = LayoutEngine.renameDesktop(state, second.id, 'beta');
    expect(LayoutEngine.getDesktop(state, second.id)?.name).toBe('beta');
    expect(LayoutEngine.getDesktop(state, third.id)).toBe(third);

    state = LayoutEngine.updateDesktop(state, third.id, { order: 1 });
    expect(state.desktops.map((desktop) => desktop.name)).toEqual(['c', 'a', 'beta']);
    expect(state.desktops.map((desktop) => desktop.order)).toEqual([1, 2, 3]);
    expect(state.activeDesktopId).toBe(desktopAt(state, 1).id);
    expectShape(state);
  });

  it('returns the same state when a desktop patch changes nothing', () => {
    const state = LayoutEngine.createInitialState('a');
    const desktop = desktopAt(state);
    expect(LayoutEngine.updateDesktop(state, desktop.id, { name: 'a', order: 1 })).toBe(state);
    expect(LayoutEngine.renameDesktop(state, desktop.id, 'a')).toBe(state);
  });

  it('switches the active desktop', () => {
    let state = LayoutEngine.createDesktop(LayoutEngine.createInitialState(), 'other');
    const other = desktopAt(state, 1);
    const next = LayoutEngine.switchDesktop(state, other.id);

    expect(next.activeDesktopId).toBe(other.id);
    expect(next.desktops).toBe(state.desktops);
    expect(LayoutEngine.switchDesktop(next, other.id)).toBe(next);
  });

  it('closes a desktop, renumbers the rest, and keeps one desktop at minimum', () => {
    let state = LayoutEngine.createInitialState('a');
    state = LayoutEngine.createDesktop(state, 'b');
    state = LayoutEngine.createDesktop(state, 'c');
    const first = desktopAt(state, 0);
    const second = desktopAt(state, 1);
    const third = desktopAt(state, 2);

    const closedMiddle = LayoutEngine.closeDesktop(state, second.id);
    expect(closedMiddle.desktops.map((desktop) => desktop.id)).toEqual([first.id, third.id]);
    expect(closedMiddle.desktops.map((desktop) => desktop.order)).toEqual([1, 2]);
    expect(closedMiddle.activeDesktopId).toBe(first.id);
    expect(desktopAt(closedMiddle, 0)).toBe(first);

    const closedActive = LayoutEngine.closeDesktop(closedMiddle, first.id);
    expect(closedActive.desktops.map((desktop) => desktop.name)).toEqual(['c']);
    expect(closedActive.activeDesktopId).toBe(third.id);
    expect(desktopAt(closedActive).order).toBe(1);

    const replaced = LayoutEngine.closeDesktop(closedActive, third.id);
    expect(replaced.desktops).toHaveLength(1);
    expect(desktopAt(replaced).id).not.toBe(third.id);
    expect(desktopAt(replaced).name).toBe('1');
    expect(desktopAt(replaced).columns).toEqual([]);
    expect(replaced.activeDesktopId).toBe(desktopAt(replaced).id);
    expectShape(replaced);
  });

  it('activates the desktop that takes the closed desktop place', () => {
    let state = LayoutEngine.createInitialState('a');
    state = LayoutEngine.createDesktop(state, 'b');
    state = LayoutEngine.createDesktop(state, 'c');
    state = LayoutEngine.switchDesktop(state, desktopAt(state, 1).id);

    const next = LayoutEngine.closeDesktop(state, desktopAt(state, 1).id);
    expect(next.desktops.map((desktop) => desktop.name)).toEqual(['a', 'c']);
    expect(next.activeDesktopId).toBe(desktopAt(next, 1).id);
  });

  it('rejects unknown desktops and empty names without changing state', () => {
    const state = freeze(LayoutEngine.createInitialState('a'));

    expect(() => LayoutEngine.getDesktop(state, 'missing')).not.toThrow();
    expect(LayoutEngine.getDesktop(state, 'missing')).toBeUndefined();
    expect(() => LayoutEngine.renameDesktop(state, 'missing', 'b')).toThrow(
      'Desktop not found: missing',
    );
    expect(() => LayoutEngine.switchDesktop(state, 'missing')).toThrow(
      'Desktop not found: missing',
    );
    expect(() => LayoutEngine.closeDesktop(state, 'missing')).toThrow('Desktop not found: missing');
    expect(() => LayoutEngine.updateDesktop(state, desktopAt(state).id, { name: ' ' })).toThrow(
      'Desktop name must not be empty',
    );
    expect(() => LayoutEngine.updateDesktop(state, desktopAt(state).id, { order: 2 })).toThrow(
      'Desktop order out of range: 2',
    );
    expect(state.desktops).toHaveLength(1);
  });
});

describe('LayoutEngine columns', () => {
  it('creates, reads, resizes, and deletes a column inside a desktop', () => {
    const initial = freeze(LayoutEngine.createInitialState());
    const created = LayoutEngine.createColumn(initial, { width: 2, minWidth: 1 });
    const column = columnAt(desktopAt(created));

    expect(initial.desktops[0]?.columns).toEqual([]);
    expect(column.width).toBe(2);
    expect(column.minWidth).toBe(1);
    expect(column.tiles).toEqual([]);
    expect(column.id).toMatch(/^col-/);
    expect(LayoutEngine.getColumn(created, column.id)).toBe(column);

    const resized = LayoutEngine.resizeColumn(created, column.id, 3);
    expect(columnAt(desktopAt(resized)).width).toBe(3);
    expect(LayoutEngine.getColumn(created, column.id)?.width).toBe(2);

    const removed = LayoutEngine.deleteColumn(resized, column.id);
    expect(desktopAt(removed).columns).toEqual([]);
    expect(LayoutEngine.getColumn(removed, column.id)).toBeUndefined();
    expectShape(removed);
  });

  it('inserts a column at an index and keeps the other desktop shared', () => {
    let state = LayoutEngine.createDesktop(LayoutEngine.createInitialState('a'), 'b');
    const second = desktopAt(state, 1);
    state = LayoutEngine.createColumn(state, { desktopId: desktopAt(state).id, index: 0 });
    state = LayoutEngine.createColumn(state, { desktopId: desktopAt(state).id, width: 4 });

    expect(desktopAt(state).columns).toHaveLength(2);
    expect(columnAt(desktopAt(state), 1).width).toBe(4);
    expect(desktopAt(state, 1)).toBe(second);
    expect(state.activeDesktopId).toBe(desktopAt(state).id);
  });

  it('rejects invalid column changes', () => {
    const state = freeze(
      LayoutEngine.createColumn(LayoutEngine.createInitialState(), { width: 2 }),
    );
    const column = columnAt(desktopAt(state));

    expect(() => LayoutEngine.createColumn(state, { width: 0 })).toThrow(
      'Column width must be a finite number greater than 0',
    );
    expect(() => LayoutEngine.createColumn(state, { index: 2 })).toThrow(
      'Column index out of range: 2',
    );
    expect(() => LayoutEngine.updateColumn(state, column.id, { width: 1, minWidth: 2 })).toThrow(
      'Column width must not be less than minWidth',
    );
    expect(() => LayoutEngine.deleteColumn(state, 'missing')).toThrow('Column not found: missing');
    expect(() => LayoutEngine.getColumn(state, column.id, 'missing')).not.toThrow();
    expect(LayoutEngine.getColumn(state, column.id, 'missing')).toBeUndefined();
    expect(state.desktops[0]?.columns).toHaveLength(1);
  });

  it('clears focus when the focused column is deleted', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'panel');
    const columnId = columnAt(desktopAt(state)).id;
    expect(desktopAt(state).focused?.columnId).toBe(columnId);

    state = LayoutEngine.deleteColumn(state, columnId);
    expect(desktopAt(state).focused).toBeUndefined();
    expect(desktopAt(state).columns).toEqual([]);
  });
});

describe('LayoutEngine tiles', () => {
  it('opens a tile into a new column, then stacks the next tile below it', () => {
    const initial = freeze(LayoutEngine.createInitialState());
    const props = { title: 'One' };
    const opened = LayoutEngine.openTile(initial, 'editor', { props, height: 2 });
    props.title = 'changed';

    const column = columnAt(desktopAt(opened));
    const first = tileAt(column);
    expect(opened.desktops).not.toBe(initial.desktops);
    expect(column.tiles).toHaveLength(1);
    expect(first.componentId).toBe('editor');
    expect(first.height).toBe(2);
    expect(first.position).toBe(0);
    expect(first.props).toEqual({ title: 'One' });
    expect(desktopAt(opened).focused).toEqual({ columnId: column.id, tileId: first.id });

    const stacked = LayoutEngine.openTile(opened, 'terminal');
    const stackedColumn = columnAt(desktopAt(stacked));
    expect(desktopAt(stacked).columns).toHaveLength(1);
    expect(stackedColumn.tiles.map((tile) => tile.componentId)).toEqual(['editor', 'terminal']);
    expect(stackedColumn.tiles.map((tile) => tile.position)).toEqual([0, 1]);
    expect(desktopAt(stacked).focused?.tileId).toBe(tileAt(stackedColumn, 1).id);
    expect(LayoutEngine.getTile(stacked, first.id)).toMatchObject({ height: 2, position: 0 });
    expectShape(stacked);
  });

  it('inserts a tile at a position and reads it back from its desktop', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'a');
    state = LayoutEngine.openTile(state, 'b');
    const columnId = columnAt(desktopAt(state)).id;

    state = LayoutEngine.openTile(state, 'c', { columnId, index: 0, height: 5 });
    const column = columnAt(desktopAt(state));
    expect(column.tiles.map((tile) => tile.componentId)).toEqual(['c', 'a', 'b']);
    expect(column.tiles.map((tile) => tile.position)).toEqual([0, 1, 2]);
    expect(tileAt(column).height).toBe(5);

    const other = LayoutEngine.createDesktop(state, 'other');
    expect(LayoutEngine.getTile(other, tileAt(column).id, desktopAt(other, 1).id)).toBeUndefined();
    expect(LayoutEngine.getTile(other, tileAt(column).id)?.componentId).toBe('c');
  });

  it('updates size and position inside the column', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'a');
    state = LayoutEngine.openTile(state, 'b');
    state = LayoutEngine.openTile(state, 'c');
    const target = tileAt(columnAt(desktopAt(state)), 2);

    state = LayoutEngine.resizeTile(state, target.id, 4);
    expect(LayoutEngine.getTile(state, target.id)?.height).toBe(4);

    state = LayoutEngine.updateTile(state, target.id, { position: 0, componentId: 'c-moved' });
    const column = columnAt(desktopAt(state));
    expect(column.tiles.map((tile) => tile.componentId)).toEqual(['c-moved', 'a', 'b']);
    expect(column.tiles.map((tile) => tile.position)).toEqual([0, 1, 2]);
    expect(tileAt(column).id).toBe(target.id);
    expect(LayoutEngine.updateTile(state, target.id, { position: 0, height: 4 })).toBe(state);
    expectShape(state);
  });

  it('removes an empty column and moves focus to a neighbor', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'left');
    const leftColumn = columnAt(desktopAt(state)).id;
    state = LayoutEngine.createColumn(state);
    const right = columnAt(desktopAt(state), 1);
    state = LayoutEngine.openTile(state, 'right', { columnId: right.id });
    state = LayoutEngine.focus(state, leftColumn, tileAt(columnAt(desktopAt(state))).id);

    const closedLeft = LayoutEngine.closeTile(state, tileAt(columnAt(desktopAt(state))).id);
    expect(desktopAt(closedLeft).columns).toHaveLength(1);
    expect(tileAt(columnAt(desktopAt(closedLeft))).componentId).toBe('right');
    expect(desktopAt(closedLeft).focused?.tileId).toBe(tileAt(columnAt(desktopAt(closedLeft))).id);

    let stacked = LayoutEngine.openTile(closedLeft, 'below');
    const top = tileAt(columnAt(desktopAt(stacked)));
    const bottom = tileAt(columnAt(desktopAt(stacked)), 1);
    stacked = LayoutEngine.focus(stacked, columnAt(desktopAt(stacked)).id, top.id);
    const closedTop = LayoutEngine.closeTile(stacked, top.id);
    expect(columnAt(desktopAt(closedTop)).tiles.map((tile) => tile.id)).toEqual([bottom.id]);
    expect(tileAt(columnAt(desktopAt(closedTop))).position).toBe(0);
    expect(desktopAt(closedTop).focused?.tileId).toBe(bottom.id);

    const emptied = LayoutEngine.closeTile(closedTop, bottom.id);
    expect(desktopAt(emptied).columns).toEqual([]);
    expect(desktopAt(emptied).focused).toBeUndefined();
    expectShape(emptied);
  });

  it('does not change focus when a different tile is closed', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'a');
    state = LayoutEngine.openTile(state, 'b');
    const kept = tileAt(columnAt(desktopAt(state)));
    const closed = tileAt(columnAt(desktopAt(state)), 1);
    state = LayoutEngine.focus(state, columnAt(desktopAt(state)).id, kept.id);

    const next = LayoutEngine.closeTile(state, closed.id);
    expect(desktopAt(next).focused?.tileId).toBe(kept.id);
    expect(columnAt(desktopAt(next)).tiles).toHaveLength(1);
  });

  it('opens a tile on another desktop without switching the active one', () => {
    let state = LayoutEngine.createDesktop(LayoutEngine.createInitialState('a'), 'b');
    const activeId = state.activeDesktopId;
    const otherId = desktopAt(state, 1).id;

    state = LayoutEngine.openTile(state, 'remote', { desktopId: otherId });
    expect(state.activeDesktopId).toBe(activeId);
    expect(desktopAt(state).columns).toEqual([]);
    expect(tileAt(columnAt(desktopAt(state, 1))).componentId).toBe('remote');
    expect(desktopAt(state, 1).focused?.tileId).toBe(tileAt(columnAt(desktopAt(state, 1))).id);
  });

  it('rejects invalid tile operations and keeps the previous state', () => {
    const state = freeze(LayoutEngine.openTile(LayoutEngine.createInitialState(), 'a'));
    const tile = tileAt(columnAt(desktopAt(state)));
    const before = structuredClone(state);

    expect(() => LayoutEngine.openTile(state, ' ')).toThrow('componentId must not be empty');
    expect(() => LayoutEngine.openTile(state, 'b', { height: -1 })).toThrow(
      'Tile height must be a finite number greater than 0',
    );
    expect(() => LayoutEngine.openTile(state, 'b', { columnId: 'missing' })).toThrow(
      'Column not found: missing',
    );
    expect(() => LayoutEngine.openTile(state, 'b', { index: 2 })).toThrow(
      'Tile index out of range: 2',
    );
    expect(() => LayoutEngine.updateTile(state, tile.id, { position: 1 })).toThrow(
      'Tile position out of range: 1',
    );
    expect(() => LayoutEngine.updateTile(state, tile.id, { minHeight: 5 })).toThrow(
      'Tile height must not be less than minHeight',
    );
    expect(() => LayoutEngine.closeTile(state, 'missing')).toThrow('Tile not found: missing');
    expect(LayoutEngine.getTile(state, 'missing')).toBeUndefined();
    expect(state).toEqual(before);
  });

  it('focuses a tile without moving it or switching desktops', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'a');
    state = LayoutEngine.openTile(state, 'b');
    const column = columnAt(desktopAt(state));
    const first = tileAt(column);
    const activeId = state.activeDesktopId;

    const focused = LayoutEngine.focus(state, column.id, first.id);
    expect(desktopAt(focused).focused).toEqual({ columnId: column.id, tileId: first.id });
    expect(columnAt(desktopAt(focused)).tiles.map((tile) => tile.id)).toEqual([
      first.id,
      tileAt(column, 1).id,
    ]);
    expect(focused.activeDesktopId).toBe(activeId);
    expect(LayoutEngine.focus(focused, column.id, first.id)).toBe(focused);
    expect(() => LayoutEngine.focus(state, column.id, 'missing')).toThrow(
      'Tile not found: missing',
    );
  });
});

describe('LayoutEngine moveTile', () => {
  function columnLayout(): LayoutState {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'a');
    state = LayoutEngine.openTile(state, 'b');
    state = LayoutEngine.openTile(state, 'c');
    state = LayoutEngine.createColumn(state);
    const rightId = columnAt(desktopAt(state), 1).id;
    state = LayoutEngine.openTile(state, 'd', { columnId: rightId });
    state = LayoutEngine.openTile(state, 'e', { columnId: rightId });
    return state;
  }

  it('reorders a tile inside its column by direction and by index', () => {
    const state = freeze(columnLayout());
    const right = columnAt(desktopAt(state), 1);
    const movedUp = LayoutEngine.moveTile(state, tileByComponent(state, 'b').id, {
      direction: 'up',
    });
    expect(componentsOf(movedUp)).toEqual([
      ['b', 'a', 'c'],
      ['d', 'e'],
    ]);
    expect(columnAt(desktopAt(movedUp), 1)).toBe(right);

    const movedDown = LayoutEngine.moveTile(state, tileByComponent(state, 'b').id, {
      direction: 'down',
    });
    expect(componentsOf(movedDown)).toEqual([
      ['a', 'c', 'b'],
      ['d', 'e'],
    ]);

    const movedToTop = LayoutEngine.moveTile(state, tileByComponent(state, 'c').id, {
      direction: 'up',
      index: 0,
    });
    expect(componentsOf(movedToTop)).toEqual([
      ['c', 'a', 'b'],
      ['d', 'e'],
    ]);
    expect(tileByComponent(movedToTop, 'c').id).toBe(tileByComponent(state, 'c').id);
    expectShape(movedUp);
  });

  it('returns the same state when the tile is already in place', () => {
    const state = columnLayout();
    const top = tileByComponent(state, 'a').id;
    const bottom = tileByComponent(state, 'e').id;
    const alone = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'only');

    expect(LayoutEngine.moveTile(state, top, { direction: 'up' })).toBe(state);
    expect(LayoutEngine.moveTile(state, bottom, { direction: 'down' })).toBe(state);
    expect(LayoutEngine.moveTile(state, top, { index: 0 })).toBe(state);
    expect(LayoutEngine.moveTile(state, top, {})).toBe(state);
    expect(LayoutEngine.moveTile(state, top, { direction: 'left' })).toBe(state);
    expect(
      LayoutEngine.moveTile(state, bottom, {
        direction: 'right',
        desktopId: state.activeDesktopId,
      }),
    ).toBe(state);
    expect(
      LayoutEngine.moveTile(alone, tileByComponent(alone, 'only').id, { direction: 'new-column' }),
    ).toBe(alone);
  });

  it('moves a tile into another column and drops an empty source column', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'a');
    state = LayoutEngine.openTile(state, 'b');
    state = LayoutEngine.createColumn(state);
    const rightId = columnAt(desktopAt(state), 1).id;
    state = LayoutEngine.openTile(state, 'c', { columnId: rightId });
    state = LayoutEngine.resizeColumn(state, columnAt(desktopAt(state)).id, 3);
    const leftId = columnAt(desktopAt(state)).id;

    const byId = LayoutEngine.moveTile(state, tileByComponent(state, 'b').id, {
      columnId: rightId,
      index: 0,
    });
    expect(componentsOf(byId)).toEqual([['a'], ['b', 'c']]);
    expect(columnAt(desktopAt(byId)).width).toBe(3);
    expect(columnAt(desktopAt(byId)).id).toBe(leftId);

    const toRight = LayoutEngine.moveTile(state, tileByComponent(state, 'a').id, {
      direction: 'right',
      index: 1,
    });
    expect(componentsOf(toRight)).toEqual([['b'], ['c', 'a']]);

    const last = LayoutEngine.moveTile(toRight, tileByComponent(toRight, 'b').id, {
      direction: 'right',
    });
    expect(componentsOf(last)).toEqual([['b', 'c', 'a']]);
    expect(desktopAt(last).columns).toHaveLength(1);
    expectShape(last);
  });

  it('moves a tile left and into a new column on the right', () => {
    const state = columnLayout();
    const movedLeft = LayoutEngine.moveTile(state, tileByComponent(state, 'e').id, {
      direction: 'left',
    });
    expect(componentsOf(movedLeft)).toEqual([['a', 'e', 'b', 'c'], ['d']]);

    const extracted = LayoutEngine.moveTile(state, tileByComponent(state, 'b').id, {
      direction: 'new-column',
    });
    expect(componentsOf(extracted)).toEqual([['a', 'c'], ['b'], ['d', 'e']]);
    expect(columnAt(desktopAt(extracted), 1).width).toBe(1);
    expect(columnAt(desktopAt(extracted)).id).toBe(columnAt(desktopAt(state)).id);

    const anchored = LayoutEngine.moveTile(state, tileByComponent(state, 'a').id, {
      direction: 'new-column',
      columnId: columnAt(desktopAt(state), 1).id,
    });
    expect(componentsOf(anchored)).toEqual([['b', 'c'], ['d', 'e'], ['a']]);
    expectShape(extracted);
  });

  it('moves a tile onto another desktop without switching the active one', () => {
    let state = columnLayout();
    state = LayoutEngine.createDesktop(state, 'other');
    const activeId = state.activeDesktopId;
    const otherId = desktopAt(state, 1).id;
    const origin = tileByComponent(state, 'b');
    state = LayoutEngine.resizeTile(state, origin.id, 4);
    state = LayoutEngine.focus(state, columnAt(desktopAt(state)).id, origin.id);

    const ontoEmpty = LayoutEngine.moveTile(state, origin.id, { desktopId: otherId });
    expect(state.activeDesktopId).toBe(activeId);
    expect(ontoEmpty.activeDesktopId).toBe(activeId);
    expect(componentsOf(ontoEmpty)).toEqual([
      ['a', 'c'],
      ['d', 'e'],
    ]);
    expect(componentsOf(ontoEmpty, 1)).toEqual([['b']]);
    expect(tileByComponent(ontoEmpty, 'b', 1).height).toBe(4);
    expect(desktopAt(ontoEmpty).focused?.tileId).toBe(tileByComponent(ontoEmpty, 'c').id);
    expect(desktopAt(ontoEmpty, 1).focused?.tileId).toBe(origin.id);

    let occupied = LayoutEngine.openTile(state, 'x', { desktopId: otherId });
    occupied = LayoutEngine.openTile(occupied, 'y', { desktopId: otherId });
    const other = desktopAt(occupied, 1);
    const down = LayoutEngine.moveTile(occupied, origin.id, {
      direction: 'down',
      desktopId: otherId,
    });
    expect(componentsOf(down, 1)).toEqual([['x', 'y', 'b']]);
    expect(desktopAt(down, 1).focused?.tileId).toBe(origin.id);
    expect(other.columns[0]?.id).toBe(columnAt(desktopAt(down, 1)).id);

    const up = LayoutEngine.moveTile(occupied, tileByComponent(occupied, 'a').id, {
      direction: 'up',
      desktopId: otherId,
    });
    expect(componentsOf(up)).toEqual([
      ['b', 'c'],
      ['d', 'e'],
    ]);
    expect(componentsOf(up, 1)).toEqual([['a', 'x', 'y']]);
    expect(desktopAt(up).focused?.tileId).toBe(origin.id);

    const toLeftEdge = LayoutEngine.moveTile(occupied, origin.id, {
      direction: 'left',
      desktopId: otherId,
    });
    expect(componentsOf(toLeftEdge, 1)).toEqual([['b'], ['x', 'y']]);

    const toRightEdge = LayoutEngine.moveTile(occupied, origin.id, {
      direction: 'new-column',
      desktopId: otherId,
    });
    expect(componentsOf(toRightEdge, 1)).toEqual([['x', 'y'], ['b']]);
    expectShape(toRightEdge);
  });

  it('follows focus only for the moved tile and keeps an unfocused move local', () => {
    const state = columnLayout();
    const focusedId = tileByComponent(state, 'd').id;
    const columnId = columnAt(desktopAt(state), 1).id;
    const focused = LayoutEngine.focus(state, columnId, focusedId);

    const movedNeighbor = LayoutEngine.moveTile(focused, tileByComponent(focused, 'a').id, {
      direction: 'down',
    });
    expect(desktopAt(movedNeighbor).focused).toEqual({ columnId, tileId: focusedId });

    const followed = LayoutEngine.moveTile(focused, focusedId, { direction: 'left', index: 1 });
    const landing = columnAt(desktopAt(followed));
    expect(componentsOf(followed)).toEqual([['a', 'd', 'b', 'c'], ['e']]);
    expect(desktopAt(followed).focused).toEqual({ columnId: landing.id, tileId: focusedId });
  });

  it('rejects a missing tile, desktop, or column and an index outside the column', () => {
    let state = freeze(columnLayout());
    state = freeze(LayoutEngine.createDesktop(state, 'other'));
    const before = structuredClone(state);
    const tileId = tileByComponent(state, 'a').id;
    const otherId = desktopAt(state, 1).id;
    const foreignColumn = columnAt(desktopAt(state), 1).id;

    expect(() => LayoutEngine.moveTile(state, 'missing', { direction: 'up' })).toThrow(
      'Tile not found: missing',
    );
    expect(() => LayoutEngine.moveTile(state, tileId, { desktopId: 'missing' })).toThrow(
      'Desktop not found: missing',
    );
    expect(() => LayoutEngine.moveTile(state, tileId, { columnId: 'missing' })).toThrow(
      'Column not found: missing',
    );
    expect(() =>
      LayoutEngine.moveTile(state, tileId, { desktopId: otherId, columnId: foreignColumn }),
    ).toThrow(`Column not found: ${foreignColumn}`);
    expect(() => LayoutEngine.moveTile(state, tileId, { index: 9 })).toThrow(
      'Tile index out of range: 9',
    );
    expect(() => LayoutEngine.moveTile(state, tileId, { desktopId: otherId, index: 2 })).toThrow(
      'Tile index out of range: 2',
    );
    expect(state).toEqual(before);
  });
});

describe('LayoutEngine placeTile', () => {
  it('splits a row sideways and keeps the row height as a share of the column', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'top');
    state = LayoutEngine.openTile(state, 'bottom', { height: 2 });
    state = LayoutEngine.openTile(state, 'side');
    const side = tileByComponent(state, 'side');
    const bottom = tileByComponent(state, 'bottom');

    const placed = LayoutEngine.placeTile(state, side.id, { tileId: bottom.id, edge: 'right' });
    const tiles = columnAt(desktopAt(placed)).tiles;
    expect(tiles.map((tile) => [tile.componentId, tile.row, tile.width, tile.height])).toEqual([
      ['top', 0, 1, 1],
      ['bottom', 1, 0.5, 2],
      ['side', 1, 0.5, 2],
    ]);
    expect(LayoutEngine.placeTile(placed, side.id, { tileId: bottom.id, edge: 'right' })).toBe(
      placed,
    );
    expectShape(placed);
  });

  it('splits the target row in half and collapses an emptied row', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'a', { height: 2 });
    state = LayoutEngine.openTile(state, 'b');
    const above = LayoutEngine.placeTile(state, tileByComponent(state, 'b').id, {
      tileId: tileByComponent(state, 'a').id,
      edge: 'above',
    });
    expect(
      columnAt(desktopAt(above)).tiles.map((tile) => [tile.componentId, tile.height, tile.row]),
    ).toEqual([
      ['b', 1, 0],
      ['a', 1, 1],
    ]);

    const joined = LayoutEngine.placeTile(above, tileByComponent(above, 'a').id, {
      tileId: tileByComponent(above, 'b').id,
      edge: 'right',
    });
    expect(
      columnAt(desktopAt(joined)).tiles.map((tile) => [tile.componentId, tile.row, tile.width]),
    ).toEqual([
      ['b', 0, 0.5],
      ['a', 0, 0.5],
    ]);
    expect(LayoutEngine.toJSON(joined)).toEqual(
      JSON.parse(JSON.stringify(LayoutEngine.toJSON(joined))),
    );
    expect(LayoutEngine.fromJSON(LayoutEngine.toJSON(joined))).toEqual(joined);

    const closed = LayoutEngine.closeTile(joined, tileByComponent(joined, 'a').id);
    expect(tileByComponent(closed, 'b')).toMatchObject({ width: 1, row: 0, position: 0 });
    expectShape(closed);
  });

  it('follows focus, drops an empty column, and rejects a missing tile', () => {
    let state = LayoutEngine.openTile(LayoutEngine.createInitialState(), 'left');
    const leftId = tileByComponent(state, 'left').id;
    state = LayoutEngine.createColumn(state);
    const rightColumn = columnAt(desktopAt(state), 1).id;
    state = LayoutEngine.openTile(state, 'right', { columnId: rightColumn });
    state = LayoutEngine.focus(state, columnAt(desktopAt(state)).id, leftId);
    const before = structuredClone(state);

    const moved = LayoutEngine.placeTile(state, leftId, {
      tileId: tileByComponent(state, 'right').id,
      edge: 'left',
    });
    expect(componentsOf(moved)).toEqual([['left', 'right']]);
    expect(desktopAt(moved).focused?.tileId).toBe(leftId);
    expect(desktopAt(moved).columns).toHaveLength(1);

    expect(() =>
      LayoutEngine.placeTile(state, 'missing', { tileId: leftId, edge: 'below' }),
    ).toThrow('Tile not found: missing');
    expect(state).toEqual(before);
    expectShape(moved);
  });
});

describe('LayoutEngine serialization', () => {
  function complexState(): LayoutState {
    let state = LayoutEngine.createInitialState('main');
    state = LayoutEngine.openTile(state, 'editor', {
      height: 2,
      props: { title: 'Notes', nested: { open: true }, tags: ['a', 'b'] },
    });
    state = LayoutEngine.openTile(state, 'terminal');
    const editor = tileByComponent(state, 'editor');
    state = LayoutEngine.updateTile(state, editor.id, { minHeight: 1 });
    state = LayoutEngine.resizeTile(state, tileByComponent(state, 'terminal').id, 4);
    state = LayoutEngine.createColumn(state, { width: 2, minWidth: 1 });
    const sideColumn = columnAt(desktopAt(state), 1).id;
    state = LayoutEngine.openTile(state, 'side', { columnId: sideColumn });
    state = LayoutEngine.focus(state, columnAt(desktopAt(state)).id, editor.id);

    state = LayoutEngine.createDesktop(state, 'other');
    const otherId = desktopAt(state, 1).id;
    state = LayoutEngine.openTile(state, 'mail', {
      desktopId: otherId,
      props: { unread: 3 },
    });
    return LayoutEngine.switchDesktop(state, otherId);
  }

  it('roundtrips a layout with desktops, columns, tiles, focus and props', () => {
    const state = complexState();
    const json = LayoutEngine.toJSON(state);
    const encoded = JSON.parse(JSON.stringify(json)) as unknown;

    expect(json).not.toBe(state);
    expect(LayoutEngine.fromJSON(json)).toEqual(state);
    expect(LayoutEngine.fromJSON(encoded)).toEqual(state);

    const restored = LayoutEngine.fromJSON(json);
    const props = tileByComponent(restored, 'editor').props as { title: string };
    props.title = 'changed';
    expect(tileByComponent(state, 'editor').props).toEqual({
      title: 'Notes',
      nested: { open: true },
      tags: ['a', 'b'],
    });
    expect(desktopAt(restored).focused?.tileId).toBe(tileByComponent(restored, 'editor').id);
    expect(desktopAt(restored, 1).focused?.tileId).toBe(tileByComponent(restored, 'mail', 1).id);
    expect(restored.activeDesktopId).toBe(desktopAt(restored, 1).id);
    expect(columnAt(desktopAt(restored), 1).minWidth).toBe(1);
    expect(tileByComponent(restored, 'editor').minHeight).toBe(1);
    expectShape(restored);
  });

  it('restores the minimal layout and recalculates order and position', () => {
    const initial = LayoutEngine.createInitialState('main');
    expect(LayoutEngine.toJSON(initial)).toEqual({
      activeDesktopId: initial.activeDesktopId,
      desktops: [{ id: initial.activeDesktopId, order: 1, name: 'main', columns: [] }],
    });
    expect(LayoutEngine.fromJSON(LayoutEngine.toJSON(initial))).toEqual(initial);

    const raw = {
      activeDesktopId: 'beta',
      desktops: [
        {
          id: 'alpha',
          name: 'A',
          order: 9,
          columns: [
            {
              id: 'col',
              width: 2,
              tiles: [
                { id: 'second', componentId: 'two', height: 1, position: 5 },
                { id: 'first', componentId: 'one', height: 3 },
              ],
            },
          ],
        },
        { id: 'beta', name: 'B', columns: [] },
      ],
    };
    const parsed = LayoutEngine.fromJSON(freeze(structuredClone(raw)));

    expect(parsed.activeDesktopId).toBe('beta');
    expect(parsed.desktops.map((desktop) => desktop.order)).toEqual([1, 2]);
    expect(parsed.desktops.map((desktop) => desktop.name)).toEqual(['A', 'B']);
    expect(columnAt(desktopAt(parsed)).tiles.map((tile) => [tile.id, tile.position])).toEqual([
      ['second', 0],
      ['first', 1],
    ]);
    expect(raw.desktops[0]?.order).toBe(9);
    expectShape(parsed);

    const minimal = LayoutEngine.fromJSON({
      activeDesktopId: 'desk',
      desktops: [{ id: 'desk', name: '1', columns: [] }],
    });
    expect(minimal).toEqual({
      activeDesktopId: 'desk',
      desktops: [{ id: 'desk', order: 1, name: '1', columns: [] }],
    });
  });

  it('rejects malformed structure, types, and broken ids', () => {
    const validDesktop = { id: 'desk', name: '1', columns: [] };
    const cases: Array<[unknown, string]> = [
      [null, 'Layout state must be an object'],
      [[], 'Layout state must be an object'],
      [{ activeDesktopId: 'desk' }, 'Layout state desktops must be an array'],
      [{ desktops: [], activeDesktopId: 'desk' }, 'Layout state must contain at least one desktop'],
      [{ desktops: [validDesktop], activeDesktopId: 1 }, 'Active desktop id must be a string'],
      [{ desktops: [validDesktop], activeDesktopId: 'missing' }, 'Desktop not found: missing'],
      [{ desktops: [null], activeDesktopId: 'desk' }, 'Desktop at index 0 must be an object'],
      [
        { desktops: [{ id: '', name: '1', columns: [] }], activeDesktopId: '' },
        'Desktop id must not be empty',
      ],
      [
        { desktops: [{ id: 'desk', name: '   ', columns: [] }], activeDesktopId: 'desk' },
        'Desktop name must not be empty',
      ],
      [
        {
          desktops: [
            { id: 'desk', name: '1', columns: [] },
            { id: 'desk', name: '2', columns: [] },
          ],
          activeDesktopId: 'desk',
        },
        'Duplicate desktop id: desk',
      ],
      [
        {
          desktops: [{ id: 'desk', name: '1', columns: [{ id: 'col', width: 'wide', tiles: [] }] }],
          activeDesktopId: 'desk',
        },
        'Column width must be a finite number greater than 0',
      ],
      [
        {
          desktops: [
            {
              id: 'desk',
              name: '1',
              columns: [
                { id: 'col', width: 1, tiles: [{ id: 4, componentId: 'panel', height: 1 }] },
              ],
            },
          ],
          activeDesktopId: 'desk',
        },
        'Tile id must be a string',
      ],
      [
        {
          desktops: [
            {
              id: 'desk',
              name: '1',
              columns: [
                {
                  id: 'col',
                  width: 1,
                  tiles: [
                    { id: 'tile', componentId: 'panel', height: 1 },
                    { id: 'tile', componentId: 'other', height: 1 },
                  ],
                },
              ],
            },
          ],
          activeDesktopId: 'desk',
        },
        'Duplicate tile id: tile',
      ],
      [
        {
          desktops: [
            {
              id: 'desk',
              name: '1',
              columns: [{ id: 'col', width: 1, tiles: [] }],
              focused: { columnId: 'missing', tileId: 'tile' },
            },
          ],
          activeDesktopId: 'desk',
        },
        'Column not found: missing',
      ],
      [
        {
          desktops: [
            {
              id: 'desk',
              name: '1',
              columns: [
                {
                  id: 'col',
                  width: 1,
                  tiles: [{ id: 'tile', componentId: 'panel', height: 1, props: [] }],
                },
              ],
            },
          ],
          activeDesktopId: 'desk',
        },
        'Tile props must be an object',
      ],
      [
        {
          desktops: [
            {
              id: 'desk',
              name: '1',
              columns: [
                {
                  id: 'col',
                  width: 1,
                  tiles: [{ id: 'tile', componentId: 'panel', height: 1, position: 'bad' }],
                },
              ],
            },
          ],
          activeDesktopId: 'desk',
        },
        'Tile position must be a finite number',
      ],
      [
        {
          desktops: [
            {
              id: 'desk',
              name: '1',
              columns: [
                {
                  id: 'col',
                  width: 1,
                  tiles: [{ id: 'tile', componentId: 'panel', height: 1 }],
                },
              ],
              focused: { columnId: 'col', tileId: 'missing' },
            },
          ],
          activeDesktopId: 'desk',
        },
        'Tile not found: missing',
      ],
    ];

    for (const [data, message] of cases) {
      expect(() => LayoutEngine.fromJSON(data)).toThrow(message);
    }
  });
});
