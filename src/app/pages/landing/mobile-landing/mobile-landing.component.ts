import { Component } from '@angular/core';

@Component({
    selector: 'app-mobile-landing',
    templateUrl: './mobile-landing.component.html',
    styleUrls: ['./mobile-landing.component.scss']
})
export class MobileLandingComponent {

    constructor() { }

    playVideo() {
        window.open('https://youtu.be/6HGl9xoUcjw', '_blank');
    }
}
