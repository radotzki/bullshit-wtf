import { Component } from '@angular/core';

@Component({
    selector: 'app-desktop-landing',
    templateUrl: './desktop-landing.component.html',
    styleUrls: ['./desktop-landing.component.scss']
})
export class DesktopLandingComponent {

    constructor() { }

    playVideo() {
        window.open('https://youtu.be/6HGl9xoUcjw', '_blank');
    }
}
