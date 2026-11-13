import { Component, ChangeDetectionStrategy, Injector } from '@angular/core';
import { CrewService, RememberedCrew, TonightCrew } from '../../../services/crew.service';
import { ApiService } from '../../../services/api.service';
import { preferredLocale, setPreferredLocale } from '../../../services/join-source';
import { HomeStrings, homeStrings } from '../home-strings';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-desktop-landing',
    templateUrl: './desktop-landing.component.html',
    styleUrls: ['./desktop-landing.component.scss']
})
export class DesktopLandingComponent {
    // Crews this browser played in, newest first: one tap back to their scoreboard and rematch.
    crews: RememberedCrew[];
    // The newest of them, when its game night is today: it leads the menu ("TONIGHT 21:00: Dana's crew").
    tonight: TonightCrew;
    // The menu's words: Hebrew, right to left, for visitors who came on /he or whose browser is in Hebrew.
    t: HomeStrings;

    constructor(crewService: CrewService, injector: Injector) {
        this.crews = crewService.list().slice(0, 3);
        // Only a browser that remembers a crew reads one (and opens the database for it).
        if (this.crews.length) {
            crewService.tonight(id => injector.get(ApiService).getCrew(id)).then(tonight => this.tonight = tonight);
        }
        this.t = homeStrings(preferredLocale());
    }

    switchLanguage() {
        setPreferredLocale(this.t.switchTo);
        this.t = homeStrings(this.t.switchTo);
    }
}
