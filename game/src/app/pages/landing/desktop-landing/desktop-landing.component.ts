import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CrewService, RememberedCrew } from '../../../services/crew.service';
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
    // The menu's words: Hebrew, right to left, for visitors who came on /he or whose browser is in Hebrew.
    t: HomeStrings;
    // Links to the search pages: a row under the menu, and in Hanukkah season a line above it.
    links: SearchLink[];
    season: SearchLink | null;
    private tag: string | null;

    constructor(crewService: CrewService) {
        this.crews = crewService.list().slice(0, 3);
        this.tag = arrivalCampaign();
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
