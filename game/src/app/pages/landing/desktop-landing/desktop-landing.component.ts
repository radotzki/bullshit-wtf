import { Component, ChangeDetectionStrategy, Injector } from '@angular/core';
import { CrewService, RememberedCrew, TonightCrew } from '../../../services/crew.service';
import { ApiService } from '../../../services/api.service';
import { arrivalCampaign, preferredLocale, setPreferredLocale } from '../../../services/join-source';
import { HomeStrings, homeStrings } from '../home-strings';
import { SearchLink, searchLinks, seasonLink } from '../search-links';

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
    // Links to the search pages: a row under the menu, and in Hanukkah season a line above it.
    links: SearchLink[];
    season: SearchLink | null;
    private tag: string | null;

    constructor(crewService: CrewService, injector: Injector) {
        this.crews = crewService.list().slice(0, 3);
        this.tag = arrivalCampaign();
        // Only a browser that remembers a crew reads one (and opens the database for it).
        if (this.crews.length) {
            crewService.tonight(id => injector.get(ApiService).getCrew(id)).then(tonight => this.tonight = tonight);
        }
        this.setLocale(preferredLocale());
    }

    switchLanguage() {
        setPreferredLocale(this.t.switchTo);
        this.setLocale(this.t.switchTo);
    }

    private setLocale(locale: string) {
        this.t = homeStrings(locale);
        this.links = searchLinks(locale, this.tag);
        this.season = seasonLink(locale, new Date(), this.tag);
    }
}
