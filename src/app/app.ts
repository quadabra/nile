import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DesktopSwitcher } from './components/desktop-switcher/desktop-switcher';
import { TilingContainer } from './components/tiling-container/tiling-container';
import { NileService } from './services/nile.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  imports: [DesktopSwitcher, TilingContainer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-dvh' },
  templateUrl: './app.html',
})
export class App {
  constructor() {
    inject(ThemeService);
    inject(NileService);
  }
}
