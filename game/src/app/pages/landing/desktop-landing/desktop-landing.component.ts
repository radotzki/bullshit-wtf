import { Component, ChangeDetectionStrategy, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { CrewService, RememberedCrew, TonightCrew } from '../../../services/crew.service';
import { ApiService } from '../../../services/api.service';
import { arrivalCampaign, preferredLocale, setPreferredLocale } from '../../../services/join-source';
import { HomeStrings, homeStrings } from '../home-strings';
import { PictureStrings, createQuery, factParts, pictureStrings } from '../front-door';
import { SearchLink, searchLinks, seasonLink } from '../search-links';
import { CodeBox } from '../code-box';
import { joinStrings } from '../../join-game/join-strings';

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
    /** The facts line in its parts (front-door.ts), each kept whole on the screen. */
    facts: string[] = [];
    // The words of the picture of one round, as on the phone home.
    p: PictureStrings;
    // The query the big Host button carries: the post's ?via= tag, if the visit came with one.
    createQuery: { via?: string };
    // Links to the search pages: a row under the menu, and in Hanukkah season a line above it.
    links: SearchLink[];
    season: SearchLink | null;
    // The code box at the top: "Got a code? [ ____ ] Join" (code-box.ts).
    box: CodeBox;
    private tag: string | null;

    constructor(crewService: CrewService, injector: Injector, router: Router) {
        this.crews = crewService.list().slice(0, 3);
        // The database and sign-in start only when someone presses Join in the box.
        this.box = new CodeBox({
            validate: pin => injector.get(ApiService).validateGameName(pin),
            navigate: (path, query) => router.navigate(path, { queryParams: query }),
            locale: () => this.t.lang,
            errorText: (code, message) => joinStrings(this.t.lang).error(code, message),
            emptyText: () => this.t.codeEmpty,
        });
        this.tag = arrivalCampaign();
        this.createQuery = createQuery(this.tag);
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
        this.facts = factParts(this.t.facts);
        this.p = pictureStrings(locale);
        this.links = searchLinks(locale, this.tag);
        this.season = seasonLink(locale, new Date(), this.tag);
    }
}
