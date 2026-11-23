import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('opens and closes tiles and switches desktops', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(
      compiled.querySelector('[data-testid="desktop"][aria-current="true"]')?.getAttribute('title'),
    ).toBe('1');
    expect(compiled.querySelector('app-tiling-container > header')).toBeNull();
    expect(compiled.querySelectorAll('[data-testid="desktop"]')).toHaveLength(1);
    expect(compiled.querySelector('[data-testid="empty-state"]')).toBeTruthy();

    compiled.querySelector<HTMLButtonElement>('[data-testid="open-tile"]')?.click();
    fixture.detectChanges();
    expect(compiled.textContent).toContain('panel-1');

    compiled.querySelector<HTMLButtonElement>('[aria-label="Close tile"]')?.click();
    fixture.detectChanges();
    expect(compiled.textContent).not.toContain('panel-1');
    expect(compiled.querySelector('[data-testid="empty-state"]')).toBeTruthy();

    compiled.querySelector<HTMLButtonElement>('[data-testid="new-desktop"]')?.click();
    fixture.detectChanges();
    const desktops = compiled.querySelectorAll<HTMLButtonElement>('[data-testid="desktop"]');
    expect(desktops).toHaveLength(2);
    expect(desktops[0]?.getAttribute('aria-current')).toBe('true');

    desktops[1]?.click();
    fixture.detectChanges();
    expect(desktops[1]?.getAttribute('aria-current')).toBe('true');
    expect(desktops[1]?.getAttribute('title')).toBe('2');
  });

  it('toggles the sidebar between icons and labels', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const rail = root.querySelector('app-desktop-switcher');
    expect(rail?.classList.contains('w-16')).toBe(true);
    expect(root.querySelector('[data-testid="desktop-name"]')).toBeNull();
    expect(root.querySelector('[data-testid="open-tile"]')?.textContent).not.toContain('New tile');

    root.querySelector<HTMLButtonElement>('[data-testid="rail-lock"]')?.click();
    fixture.detectChanges();
    expect(rail?.classList.contains('w-60')).toBe(true);
    expect(root.querySelector('[data-testid="desktop-name"]')?.textContent).toContain('1');
    expect(root.querySelector('[data-testid="open-tile"]')?.textContent).toContain('New tile');
    expect(localStorage.getItem('nile-rail')).toBe('unlocked');

    root.querySelector<HTMLButtonElement>('[data-testid="rail-lock"]')?.click();
    fixture.detectChanges();
    expect(rail?.classList.contains('w-16')).toBe(true);
    expect(root.querySelector('[data-testid="desktop-name"]')).toBeNull();
    expect(localStorage.getItem('nile-rail')).toBe('locked');
  });

  it('scrolls extra desktops with arrows and shows at most five', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="desktops-up"]')).toBeNull();

    for (let i = 0; i < 5; i += 1) {
      root.querySelector<HTMLButtonElement>('[data-testid="new-desktop"]')?.click();
      fixture.detectChanges();
    }

    const titles = () =>
      [...root.querySelectorAll<HTMLButtonElement>('[data-testid="desktop"]')].map((button) =>
        button.getAttribute('title'),
      );
    expect(titles()).toEqual(['1', '2', '3', '4', '5']);
    const up = root.querySelector<HTMLButtonElement>('[data-testid="desktops-up"]');
    const down = root.querySelector<HTMLButtonElement>('[data-testid="desktops-down"]');
    expect(up?.disabled).toBe(true);
    expect(down?.disabled).toBe(false);

    down?.click();
    fixture.detectChanges();
    expect(titles()).toEqual(['2', '3', '4', '5', '6']);
    expect(root.querySelector('[data-testid="desktops-up"]')?.hasAttribute('disabled')).toBe(false);

    root.querySelector<HTMLButtonElement>('[data-testid="desktops-up"]')?.click();
    fixture.detectChanges();
    expect(titles()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('toggles the dark class on the document', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector(
      '[data-testid="theme-toggle"]',
    ) as HTMLButtonElement;
    const before = document.documentElement.classList.contains('dark');
    toggle.click();
    fixture.detectChanges();

    expect(document.documentElement.classList.contains('dark')).toBe(!before);
    expect(localStorage.getItem('nile-theme')).toBe(before ? 'light' : 'dark');
  });
});
