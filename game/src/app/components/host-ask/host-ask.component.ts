import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './../../services/api.service';
import { GameService } from './../../services/game.service';
import { buildEventIcs, googleEventUrl } from './../../pages/crew/next-night';
import {
    ASK_TAGS, AskPlace, HostAskStrings, REMINDER_FILE, askContentType, askStrings, reminderEvent, reminderNight,
} from './host-ask';

/**
 * "Start your own game", shown to a guest when a game ends (the final screen) and to a late
 * joiner whose game is over (the join page). CREATE opens the Create page with a campaign tag;
 * REMIND ME saves a calendar entry for the coming game night, with the link to Create.
 * Every press is counted in BigQuery's shares table (content_type after-game or game-over).
 */
@Component({
    selector: 'app-host-ask',
    templateUrl: './host-ask.component.html',
    styleUrls: ['./host-ask.component.scss'],
})
export class HostAskComponent {
    @Input() locale = 'en';
    @Input() place: AskPlace = 'after-game';
    /** REMIND ME was pressed: say so, and offer Google Calendar for phones that ignore the file. */
    reminded: boolean;
    googleUrl: string;

    constructor(
        private router: Router,
        private apiService: ApiService,
        private gameService: GameService,
    ) { }

    get t(): HostAskStrings {
        return askStrings(this.locale);
    }

    get rtl() {
        return this.locale === 'he';
    }

    get late() {
        return this.place === 'game-over';
    }

    private count(method: 'create' | 'remind' | 'remind-google') {
        this.apiService.logShare(askContentType(this.place), method, { locale: this.rtl ? 'he' : 'en' });
    }

    create() {
        this.count('create');
        // The finished game must not move this phone any more (a rematch there starting, say).
        this.gameService.unregister();
        const tag = ASK_TAGS[this.late ? 'game-over' : 'after-game'].create;
        this.router.navigate(['/create-game'], { queryParams: { via: tag, lang: this.rtl ? 'he' : 'en' } });
    }

    /**
     * Saves the entry as a calendar file, which the phone's calendar opens. The share sheet is not
     * used here: this entry is for the player's own calendar, not for a group chat.
     */
    remind() {
        this.count('remind');
        const start = reminderNight(new Date(), this.locale);
        const event = reminderEvent(start, this.place, this.locale);
        this.googleUrl = googleEventUrl(start, event);
        this.reminded = true;
        this.download(buildEventIcs(start, event, new Date()));
    }

    google() {
        this.count('remind-google');
    }

    private download(ics: string) {
        const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = REMINDER_FILE;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
}
