import { dropEdge } from './tile-drag.service';

describe('dropEdge', () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 } as DOMRect;

  it('picks the nearest edge of the tile', () => {
    expect(dropEdge(rect, 12, 50)).toBe('left');
    expect(dropEdge(rect, 88, 50)).toBe('right');
    expect(dropEdge(rect, 50, 12)).toBe('above');
    expect(dropEdge(rect, 50, 88)).toBe('below');
  });
});
