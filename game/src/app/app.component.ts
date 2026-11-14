import { Component, ChangeDetectionStrategy } from '@angular/core';
import { rememberArrivalSource } from './services/join-source';
import { rememberArrival } from './services/arrival';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-root',
    template: '<router-outlet></router-outlet>',
})
export class AppComponent {
    constructor() {
        rememberArrivalSource();
        // Where this visit started, for a game this tab creates (every page of the app passes here).
        rememberArrival();
    }
}
