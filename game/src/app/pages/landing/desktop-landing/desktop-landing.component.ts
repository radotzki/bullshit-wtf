import { Component } from '@angular/core';
import { CrewService, RememberedCrew } from '../../../services/crew.service';

@Component({
    selector: 'app-desktop-landing',
    templateUrl: './desktop-landing.component.html',
    styleUrls: ['./desktop-landing.component.scss']
})
export class DesktopLandingComponent {
    // Crews this browser played in, newest first: one tap back to their scoreboard and rematch.
    crews: RememberedCrew[];

    constructor(crewService: CrewService) {
        this.crews = crewService.list().slice(0, 3);
    }
}
