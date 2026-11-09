import { Component } from '@angular/core';
import { CrewService, RememberedCrew } from '../../../services/crew.service';
import { preferredLocale, setPreferredLocale } from '../../../services/join-source';
import { HomeStrings, homeStrings } from '../home-strings';

@Component({
    selector: 'app-desktop-landing',
    templateUrl: './desktop-landing.component.html',
    styleUrls: ['./desktop-landing.component.scss']
})
export class DesktopLandingComponent {
    // Crews this browser played in, newest first: one tap back to their scoreboard and rematch.
    crews: RememberedCrew[];
    // The menu's words: Hebrew, right to left, for visitors who came on /he or whose browser is in Hebrew.
    t: HomeStrings;

    constructor(crewService: CrewService) {
        this.crews = crewService.list().slice(0, 3);
        this.t = homeStrings(preferredLocale());
    }

    switchLanguage() {
        setPreferredLocale(this.t.switchTo);
        this.t = homeStrings(this.t.switchTo);
    }
}
