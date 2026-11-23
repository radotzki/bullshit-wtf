import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { ApiService } from './../../services/api.service';
import { buildEventIcs, googleEventUrl } from './../../pages/crew/next-night';
import { REMINDER_FILE } from './../host-ask/host-ask';
import { HanukkahNightStrings, NIGHT_CONTENT, NightView, nightStrings, tableEvent, tomorrowNight } from './hanukkah-night';

/**
 * Hanukkah night on the final screen (see hanukkah-night.ts): the night's line, and on a player's phone
 * SAME TABLE TOMORROW, which saves tomorrow evening as a calendar file with the table's tagged link,
 * the way REMIND ME saves its entry. Presses are counted in BigQuery's shares (content_type hanukkah-night).
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-hanukkah-night',
    templateUrl: './hanukkah-night.component.html',
    styleUrls: ['./hanukkah-night.component.scss'],
})
export class HanukkahNightComponent {
    @Input() pin: string;
    @Input() locale = 'en';
    @Input() view: NightView;
    /** The line (under the winner, the big screen too), or the button (among a phone's actions). */
    @Input() part: 'line' | 'button' = 'line';
    /** Pressed: say so, and offer Google Calendar for phones that ignore the file. */
    saved: boolean;
    googleUrl: string;

    constructor(private apiService: ApiService) { }

    get t(): HanukkahNightStrings {
        return nightStrings(this.locale);
    }

    get rtl() {
        return this.locale === 'he';
    }

    private count(method: 'save' | 'save-google') {
        this.apiService.logShare(NIGHT_CONTENT, method, { crew: String(this.pin || '').toUpperCase(), locale: this.rtl ? 'he' : 'en' });
    }

    save() {
        if (!this.view || !this.view.next) {
            return;
        }
        this.count('save');
        const start = tomorrowNight(new Date());
        const event = tableEvent(start, this.pin, this.locale, this.view.next);
        this.googleUrl = googleEventUrl(start, event);
        this.saved = true;
        const url = URL.createObjectURL(new Blob([buildEventIcs(start, event, new Date())], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = REMINDER_FILE;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    google() {
        this.count('save-google');
    }
}
