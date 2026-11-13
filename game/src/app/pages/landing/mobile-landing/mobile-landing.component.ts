import { Component, ChangeDetectionStrategy, Injector } from '@angular/core';
import { CrewService, RememberedCrew, TonightCrew } from '../../../services/crew.service';
import { ApiService } from '../../../services/api.service';
import { arrivalCampaign, preferredLocale, setPreferredLocale } from '../../../services/join-source';
import { HomeStrings, homeStrings } from '../home-strings';
import { PictureStrings, createQuery, firstButton, pictureStrings, readVisitor, showPicture } from '../front-door';

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
    // The newest of them, when its game night is today: it leads the menu ("TONIGHT 21:00: Dana's crew").
    tonight: TonightCrew;
    // The menu's words: Hebrew, right to left, for visitors who came on /he or whose browser is in Hebrew.
    t: HomeStrings;
    // The words of the picture of the game, in the same language.
    p: PictureStrings;
    // The front door (see front-door.ts): which button leads, whether the picture shows, and the
    // post tag the Create button carries on.
    first: 'create' | 'join';
    picture: boolean;
    createQuery: { via?: string };

    constructor(crewService: CrewService, injector: Injector) {
        this.crews = crewService.list().slice(0, 3);
        // Only a browser that remembers a crew reads one (and opens the database for it).
        if (this.crews.length) {
            crewService.tonight(id => injector.get(ApiService).getCrew(id)).then(tonight => this.tonight = tonight);
        }
        this.setLocale(preferredLocale());

        const tag = arrivalCampaign();
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
    }
}
