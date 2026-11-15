import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { rememberArrivalSource } from './services/join-source';
import { aboutPlace } from './services/home-about';
import { rememberArrival } from './services/arrival';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-root',
    template: '<router-outlet></router-outlet>',
})
export class AppComponent {
    constructor(router: Router) {
        rememberArrivalSource();
        // Where this visit started, for a game this tab creates (every page of the app passes here).
        rememberArrival();
        // he.html says dir="rtl" on <html> so a search engine reads /he as a Hebrew page. The app
        // sets the direction of each screen itself (an English game can run inside he.html, after a
        // Hebrew invite link), so it starts from no direction on <html>, as on index.html.
        try {
            document.documentElement.removeAttribute('dir');
        } catch (e) { /* no document */ }
        // The text about the game under the app (index.html, BS:ABOUT) belongs to the home screens only.
        router.events.subscribe(e => {
            if (e instanceof NavigationEnd) {
                showAbout(e.urlAfterRedirects);
            }
        });
    }
}

function showAbout(url: string) {
    const el = typeof document !== 'undefined' ? document.getElementById('bs-about') : null;
    if (!el) {
        return;
    }
    const at = aboutPlace(url);
    el.hidden = !at;
    el.setAttribute('data-at', at || '');
}
