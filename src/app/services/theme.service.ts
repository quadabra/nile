import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, afterNextRender, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'nile-theme';

/** Переключатель light/dark: класс `dark` на `<html>` и значение в localStorage. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly theme = signal<Theme>('light');
  private chosen = false;

  readonly current = this.theme.asReadonly();
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    afterNextRender(() => {
      if (this.chosen) return;
      this.apply(this.readStored(), false);
    });
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.chosen = true;
    this.apply(theme, true);
  }

  private apply(theme: Theme, persist: boolean): void {
    this.theme.set(theme);
    if (!this.isBrowser) return;
    this.document.documentElement.classList.toggle('dark', theme === 'dark');
    if (persist) this.persist(theme);
  }

  private readStored(): Theme {
    if (!this.isBrowser) return 'light';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      return 'light';
    }
    return preferredTheme();
  }

  private persist(theme: Theme): void {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Приватный режим и SSR не должны ломать интерфейс.
    }
  }
}

function preferredTheme(): Theme {
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
