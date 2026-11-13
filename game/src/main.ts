import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

// Since Angular 21 an app is zoneless unless it asks for zone.js change detection. The game's screens
// update from Firebase callbacks and timers, as they always have, so it keeps zone.js.
platformBrowser().bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection()] });
