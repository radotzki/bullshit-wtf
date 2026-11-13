import { Component, ChangeDetectionStrategy } from '@angular/core';
import { rememberArrivalSource } from './services/join-source';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-root',
    template: '<router-outlet></router-outlet>',
})
export class AppComponent {
    constructor() {
        rememberArrivalSource();
    }
}
