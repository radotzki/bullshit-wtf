import { Component } from '@angular/core';
import { rememberArrivalSource } from './services/join-source';

@Component({
    selector: 'app-root',
    template: '<router-outlet></router-outlet>',
})
export class AppComponent {
    constructor() {
        rememberArrivalSource();
    }
}
