import { Component } from '@angular/core';
import { CrewService, RememberedCrew } from '../../../services/crew.service';

@Component({
    selector: 'app-mobile-landing',
    templateUrl: './mobile-landing.component.html',
    styleUrls: ['./mobile-landing.component.scss']
})
export class MobileLandingComponent {
    // Crews this browser played in, newest first: one tap back to their scoreboard and rematch.
    crews: RememberedCrew[];

    constructor(crewService: CrewService) {
        this.crews = crewService.list().slice(0, 3);
    }
}
