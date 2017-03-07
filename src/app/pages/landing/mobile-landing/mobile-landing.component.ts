import { Router } from '@angular/router';
import { Component } from '@angular/core';

@Component({
    selector: 'app-mobile-landing',
    templateUrl: './mobile-landing.component.html',
    styleUrls: ['./mobile-landing.component.scss']
})
export class MobileLandingComponent {

    constructor(
        private router: Router,
    ) { }

    playVideo() {
        window.open('https://youtu.be/6HGl9xoUcjw', '_blank');
    }

    goto(state) {
        this.router.navigate([state]);
    }

}
