import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NileService } from '../../services/nile.service';
import { ThemeService } from '../../services/theme.service';

const VISIBLE_DESKTOPS = 5;
const RAIL_KEY = 'nile-rail';

/** Боковая панель: контролы сверху, не больше пяти десктопов снизу. */
@Component({
  selector: 'app-desktop-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out',
    '[class.w-16]': 'locked()',
    '[class.w-60]': '!locked()',
  },
  template: `
    <nav
      class="flex h-full w-full flex-col border-r border-outline-variant bg-surface-container p-2"
      [class.items-center]="locked()"
      aria-label="Workspace"
    >
      <div class="flex w-full flex-col gap-1" [class.items-center]="locked()">
        <button
          type="button"
          data-testid="rail-lock"
          [class]="controlClass()"
          [attr.aria-pressed]="locked()"
          [attr.aria-label]="locked() ? 'Unlock sidebar' : 'Lock sidebar'"
          [attr.title]="locked() ? 'Unlock sidebar' : 'Lock sidebar'"
          (click)="toggleRail()"
        >
          <span class="material-symbols-outlined text-2xl" aria-hidden="true">{{
            locked() ? 'lock' : 'lock_open'
          }}</span>
          @if (!locked()) {
            <span class="truncate text-sm font-medium">Unlocked</span>
          }
        </button>

        <button
          type="button"
          data-testid="open-tile"
          [class]="controlClass()"
          aria-label="New tile"
          title="New tile"
          (click)="openTile()"
        >
          <span class="material-symbols-outlined text-2xl" aria-hidden="true">add_box</span>
          @if (!locked()) {
            <span class="truncate text-sm font-medium">New tile</span>
          }
        </button>

        <button
          type="button"
          data-testid="open-column"
          [class]="controlClass()"
          aria-label="New column"
          title="New column"
          (click)="openColumn()"
        >
          <span class="material-symbols-outlined text-2xl" aria-hidden="true">view_column</span>
          @if (!locked()) {
            <span class="truncate text-sm font-medium">New column</span>
          }
        </button>

        @if (nile.activeDesktop(); as desktop) {
          <button
            type="button"
            data-testid="close-desktop"
            [class]="controlClass()"
            aria-label="Close desktop"
            title="Close desktop"
            (click)="nile.closeDesktop(desktop.id)"
          >
            <span class="material-symbols-outlined text-2xl" aria-hidden="true">tab_close</span>
            @if (!locked()) {
              <span class="truncate text-sm font-medium">Close desktop</span>
            }
          </button>
        }

        <button
          type="button"
          data-testid="theme-toggle"
          [class]="controlClass()"
          role="switch"
          [attr.aria-checked]="theme.isDark()"
          [attr.aria-label]="theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme'"
          [attr.title]="theme.isDark() ? 'Light theme' : 'Dark theme'"
          (click)="theme.toggle()"
        >
          <span class="material-symbols-outlined text-2xl" aria-hidden="true">{{
            theme.isDark() ? 'light_mode' : 'dark_mode'
          }}</span>
          @if (!locked()) {
            <span class="truncate text-sm font-medium">{{
              theme.isDark() ? 'Light theme' : 'Dark theme'
            }}</span>
          }
        </button>
      </div>

      <div class="mt-auto flex w-full flex-col gap-1" [class.items-center]="locked()">
        @if (overflow()) {
          <button
            type="button"
            data-testid="desktops-up"
            [class]="controlClass() + ' disabled:opacity-40'"
            aria-label="Scroll desktops up"
            [disabled]="!canScrollUp()"
            (click)="scroll(-1)"
          >
            <span class="material-symbols-outlined text-2xl" aria-hidden="true"
              >keyboard_arrow_up</span
            >
          </button>
        }

        <div
          class="flex w-full flex-col gap-1"
          [class.items-center]="locked()"
          aria-label="Desktops"
        >
          @for (desktop of visibleDesktops(); track desktop.id) {
            <button
              type="button"
              data-testid="desktop"
              [class]="desktopClass(desktop.id === nile.activeDesktopId())"
              [attr.aria-current]="desktop.id === nile.activeDesktopId() ? 'true' : null"
              [attr.title]="desktop.name"
              (click)="nile.switchDesktop(desktop.id)"
            >
              @if (locked()) {
                <span class="text-sm font-medium leading-none">{{ desktop.order }}</span>
              } @else {
                <span class="truncate text-sm font-medium" data-testid="desktop-name">{{
                  desktop.name
                }}</span>
              }
            </button>
          }
        </div>

        @if (overflow()) {
          <button
            type="button"
            data-testid="desktops-down"
            [class]="controlClass() + ' disabled:opacity-40'"
            aria-label="Scroll desktops down"
            [disabled]="!canScrollDown()"
            (click)="scroll(1)"
          >
            <span class="material-symbols-outlined text-2xl" aria-hidden="true"
              >keyboard_arrow_down</span
            >
          </button>
        }

        <button
          type="button"
          data-testid="new-desktop"
          [class]="controlClass()"
          aria-label="New desktop"
          title="New desktop"
          (click)="nile.createDesktop()"
        >
          <span class="material-symbols-outlined text-2xl" aria-hidden="true">add</span>
          @if (!locked()) {
            <span class="truncate text-sm font-medium">New desktop</span>
          }
        </button>
      </div>
    </nav>
  `,
})
export class DesktopSwitcher {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly nile = inject(NileService);
  protected readonly theme = inject(ThemeService);

  /** Узкая рейка. Широкая показывает подписи. */
  protected readonly locked = signal(true);
  private readonly windowStart = signal(0);
  private trackedActiveId: string | undefined;
  private railChosen = false;
  private panelCount = 0;

  private readonly start = computed(() => {
    const maxStart = Math.max(0, this.nile.desktops().length - VISIBLE_DESKTOPS);
    return Math.min(this.windowStart(), maxStart);
  });

  protected readonly overflow = computed(() => this.nile.desktops().length > VISIBLE_DESKTOPS);
  protected readonly canScrollUp = computed(() => this.start() > 0);
  protected readonly canScrollDown = computed(
    () => this.start() + VISIBLE_DESKTOPS < this.nile.desktops().length,
  );
  protected readonly visibleDesktops = computed(() =>
    this.nile.desktops().slice(this.start(), this.start() + VISIBLE_DESKTOPS),
  );

  protected readonly controlClass = computed(() =>
    this.locked()
      ? 'grid h-10 w-10 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
      : 'flex h-10 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-on-surface-variant hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  );

  constructor() {
    afterNextRender(() => {
      if (this.railChosen || !this.isBrowser) return;
      const stored = this.readRail();
      if (stored === 'unlocked') this.locked.set(false);
    });

    effect(() => {
      const desktops = this.nile.desktops();
      const activeId = this.nile.activeDesktopId();
      const index = desktops.findIndex((desktop) => desktop.id === activeId);
      const maxStart = Math.max(0, desktops.length - VISIBLE_DESKTOPS);
      untracked(() => {
        let start = Math.min(Math.max(this.windowStart(), 0), maxStart);
        if (activeId !== this.trackedActiveId && index >= 0) {
          if (index < start) start = index;
          else if (index >= start + VISIBLE_DESKTOPS) start = index - VISIBLE_DESKTOPS + 1;
        }
        this.trackedActiveId = activeId;
        if (start !== this.windowStart()) this.windowStart.set(start);
      });
    });
  }

  protected desktopClass(active: boolean): string {
    const layout = this.locked()
      ? 'grid h-10 w-10 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
      : 'flex h-10 w-full min-w-0 items-center gap-3 rounded-lg px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
    const tone = active
      ? 'bg-primary-container text-on-primary-container'
      : 'text-on-surface-variant hover:bg-surface-container-high';
    return `${layout} ${tone}`;
  }

  protected toggleRail(): void {
    this.railChosen = true;
    const locked = !this.locked();
    this.locked.set(locked);
    this.persistRail(locked ? 'locked' : 'unlocked');
  }

  protected scroll(delta: number): void {
    const maxStart = Math.max(0, this.nile.desktops().length - VISIBLE_DESKTOPS);
    const next = Math.min(maxStart, Math.max(0, this.windowStart() + delta));
    this.windowStart.set(next);
  }

  protected openTile(): void {
    this.nile.openTile(this.nextPanelId());
  }

  protected openColumn(): void {
    this.nile.createColumn();
    const column = this.nile.activeDesktop()?.columns.at(-1);
    if (column === undefined) return;
    this.nile.openTile(this.nextPanelId(), { columnId: column.id });
  }

  private nextPanelId(): string {
    this.panelCount += 1;
    return `panel-${this.panelCount}`;
  }

  private readRail(): string | null {
    try {
      return localStorage.getItem(RAIL_KEY);
    } catch {
      return null;
    }
  }

  private persistRail(value: 'locked' | 'unlocked'): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(RAIL_KEY, value);
    } catch {
      // Приватный режим не должен ломать интерфейс.
    }
  }
}
