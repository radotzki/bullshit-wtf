import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CrewService, RememberedCrew } from '../../../services/crew.service';
import { arrivalCampaign, preferredLocale, setPreferredLocale } from '../../../services/join-source';
import { HomeStrings, homeStrings } from '../home-strings';
import { PictureStrings, createQuery, firstButton, pictureStrings, readVisitor, showPicture } from '../front-door';
import { SearchLink, searchLinks, seasonLink } from '../search-links';

/** Reads a key the game keeps in this browser: localStorage, else the tab's storage, else nothing. */
function readStored(key: string): string | null {
    try {
        const value = window.localStorage.getItem(key);
        if (value !== null) {
            return value;
        }
    } catch (e) { }
    try {
        return window.sessionStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-mobile-landing',
    templateUrl: './mobile-landing.component.html',
    styleUrls: ['./mobile-landing.component.scss']
})
export class MobileLandingComponent {
    // Crews this browser played in, newest first: one tap back to their scoreboard and rematch.
    crews: RememberedCrew[];
    // The menu's words: Hebrew, right to left, for visitors who came on /he or whose browser is in Hebrew.
    t: HomeStrings;
    // The words of the picture of the game, in the same language.
    p: PictureStrings;
    // The front door (see front-door.ts): which button leads, whether the picture shows, and the
    // post tag the Create button carries on.
    first: 'create' | 'join';
    picture: boolean;
    createQuery: { via?: string };
    // Links to the search pages: a row under the menu, and in Hanukkah season a line above it.
    links: SearchLink[];
    season: SearchLink | null;
    private tag: string | null;

    constructor(crewService: CrewService) {
        this.crews = crewService.list().slice(0, 3);
        const tag = this.tag = arrivalCampaign();
        this.setLocale(preferredLocale());

        const visitor = readVisitor(readStored, tag);
        this.first = firstButton(visitor);
        this.picture = showPicture(visitor);
        this.createQuery = createQuery(tag);
    }

    switchLanguage() {
        setPreferredLocale(this.t.switchTo);
        this.setLocale(this.t.switchTo);
    }

    private setLocale(locale: string) {
        this.t = homeStrings(locale);
        this.p = pictureStrings(locale);
        this.links = searchLinks(locale, this.tag);
        this.season = seasonLink(locale, new Date(), this.tag);
    }
}
