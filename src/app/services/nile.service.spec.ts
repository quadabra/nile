import { NileService } from './nile.service';

describe('NileService', () => {
  it('starts with one desktop and updates the signal when tiles change', () => {
    const nile = new NileService();

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
});
