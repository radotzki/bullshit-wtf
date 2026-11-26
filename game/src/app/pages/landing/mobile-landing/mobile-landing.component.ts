import { Component, ChangeDetectionStrategy, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { CrewService, RememberedCrew, TonightCrew } from '../../../services/crew.service';
import { ApiService } from '../../../services/api.service';
import { arrivalCampaign, preferredLocale, setPreferredLocale } from '../../../services/join-source';
import { HomeStrings, homeStrings } from '../home-strings';
import { PictureStrings, createQuery, firstButton, pictureStrings, readVisitor, showPicture } from '../front-door';
import { SearchLink, searchLinks, seasonLink } from '../search-links';
import { CodeBox } from '../code-box';
import { dailyHref, dailyLive } from '../daily-line';
import { DAILY_FIRST_DAY } from '../../../daily-launch';
import { pinError } from '../../join-game/join-strings';
import { TONIGHT_SHARE, TonightStrings, showTonight, tonightHref, tonightStrings } from '../tonight-line';

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
    // Links to the search pages: a row under the menu, and in Hanukkah season a line above it.
    links: SearchLink[];
    season: SearchLink | null;
    // The code box at the top: "Got a code? [ ____ ] Join" (code-box.ts).
    box: CodeBox;
    // The line under Create for a visitor on their own: shown once the daily puzzle is live.
    dailyLive: boolean;
    dailyHref: string;
    // "Not now? Send it to your group for tonight", under Start, for a browser that never played (tonight-line.ts).
    tonightShown: boolean;
    tonightWords: TonightStrings;
    tonightHref: string;
    private tag: string | null;

    constructor(crewService: CrewService, private injector: Injector, router: Router) {
        this.crews = crewService.list().slice(0, 3);
        // The database and sign-in start only when someone presses Join in the box.
        this.box = new CodeBox({
            validate: pin => injector.get(ApiService).validateGameName(pin),
            navigate: (path, query) => router.navigate(path, { queryParams: query }),
            locale: () => this.t.lang,
            errorText: (code, message, typed) => pinError(this.t.lang, code, message, typed),
            emptyText: () => this.t.codeEmpty,
        });
        const tag = this.tag = arrivalCampaign();
        // Only a browser that remembers a crew reads one (and opens the database for it).
        if (this.crews.length) {
            crewService.tonight(id => injector.get(ApiService).getCrew(id)).then(tonight => this.tonight = tonight);
        }
        this.setLocale(preferredLocale());

        const visitor = readVisitor(readStored, tag);
        this.first = firstButton(visitor);
        this.picture = showPicture(visitor);
        this.tonightShown = showTonight(visitor);
        this.createQuery = createQuery(tag);
    }

    /** The line is a plain wa.me link (phones block a window opened after a wait); this only counts the press. */
    tonightSent() {
        this.injector.get(ApiService).logShare(TONIGHT_SHARE.content, TONIGHT_SHARE.method,
            { crew: TONIGHT_SHARE.crew, locale: this.t.lang });
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
        this.dailyLive = dailyLive(DAILY_FIRST_DAY[this.t.lang], new Date());
        this.dailyHref = dailyHref(this.t.lang);
        this.tonightWords = tonightStrings(this.t.lang);
        this.tonightHref = tonightHref(this.t.lang);
    }
}
