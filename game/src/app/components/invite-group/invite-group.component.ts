import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './../../services/api.service';
import { CrewService } from './../../services/crew.service';
import { GameService } from './../../services/game.service';
import { ShareService } from './../../services/share.service';
import { reportError } from './../../sentry/sentry.module';
import {
    buildEventIcs, dateValue, defaultNight, googleEventUrl, nightLabel, parseNight, timeValue,
} from './../../pages/crew/next-night';
import {
    BestLie, INVITE_CONTENT, INVITE_FILE, INVITE_NOW_TAG, InviteStrings, inviteEvent, inviteMessage, inviteWords, tableUrl,
} from './invite-group';

/**
 * INVITE ANOTHER GROUP, shown to half of guests when a game ends, in place of "start your own
 * game" (see invite-group.ts). The button opens a sheet: a night (the coming Friday at 21:00), SEND ON
 * WHATSAPP, ADD TO MY CALENDAR. Opening it makes the guest's table, a crew of one with that night,
 * so the WhatsApp button is a plain link by the time it is pressed (phones block a window that
 * opens after a wait). Every press is counted in BigQuery's shares table (content_type host-invite).
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-invite-group',
    templateUrl: './invite-group.component.html',
    styleUrls: ['./invite-group.component.scss'],
})
export class InviteGroupComponent {
    @Input() pin: string;
    @Input() locale = 'en';
    /** The guest's nickname as the game stored it: the phone is known by it on the table's page. */
    @Input() nickname: string;
    /** The guest's best lie of the night (player.best on the final screen), the message's bait. */
    @Input() best: BestLie = null;
    /** The sheet opened (true) or closed (false): a started rematch waits for a player who is mid-send. */
    @Output() sheet = new EventEmitter<boolean>();

    open: boolean;
    changing: boolean;
    nightDate: string;
    nightTime: string;
    /** The guest's table, once the server has made it. */
    table: { id: string; name: string; time: number };
    making: boolean;
    failed: boolean;
    copied: boolean;
    calendarSaved: boolean;
    /** The night as it was last sent or saved: "Friday 20 November, 21:00". */
    sentWhen: string;

    constructor(
        private router: Router,
        private apiService: ApiService,
        private crewService: CrewService,
        private gameService: GameService,
        private shareService: ShareService,
    ) { }

    get t(): InviteStrings {
        return inviteWords(this.locale);
    }

    get rtl() {
        return this.locale === 'he';
    }

    private count(method: string) {
        const extra: { crew?: string; locale: string } = { locale: this.rtl ? 'he' : 'en' };
        if (this.table) {
            extra.crew = this.table.id;
        }
        this.apiService.logShare(INVITE_CONTENT, method, extra);
    }

    get night(): Date {
        return parseNight(this.nightDate, this.nightTime);
    }

    get nightInPast() {
        const d = this.night;
        return !!d && d.getTime() < Date.now();
    }

    get when() {
        const d = this.night;
        return d ? nightLabel(d, this.locale) : '';
    }

    /** The table is made and the night is a time still ahead: the send buttons work. */
    get ready() {
        return !!this.table && !!this.night && !this.nightInPast;
    }

    openSheet() {
        this.count('open');
        if (!this.nightDate) {
            // A different group with no habit yet: the coming Friday at 21:00, not "a week from tonight".
            const d = defaultNight(new Date(), this.locale);
            this.nightDate = dateValue(d);
            this.nightTime = timeValue(d);
        }
        this.open = true;
        this.sheet.emit(true);
        this.makeTable();
    }

    close() {
        this.open = false;
        this.sheet.emit(false);
    }

    /** Makes the guest's table, once: opening the sheet again, or sending twice, is the same table and link. */
    async makeTable() {
        if (this.table || this.making) {
            return;
        }
        const night = this.night && !this.nightInPast ? this.night : defaultNight(new Date(), this.locale);
        this.making = true;
        this.failed = false;
        try {
            this.table = await this.apiService.createTable(this.pin, night.getTime());
        } catch (err) {
            this.failed = true;
            reportError(err, 'createTable', { pin: this.pin });
        }
        this.making = false;
    }

    private get url() {
        return this.table ? tableUrl(this.table.id, this.locale) : '';
    }

    private get message() {
        return inviteMessage(this.night, this.locale, this.best);
    }

    get whatsappUrl() {
        return this.ready ? this.shareService.whatsappUrl(this.message, this.url) : '';
    }

    get googleUrl() {
        return this.ready ? googleEventUrl(this.night, inviteEvent(this.night, this.table.id, this.table.name, this.locale)) : '';
    }

    /**
     * The invitation went out, or the night was saved: the phone remembers the table (the home page
     * lists it, and on the night leads with it), and a night the guest changed is stored on the table.
     */
    private picked(how: string) {
        const night = this.night;
        this.count(how);
        this.sentWhen = this.when;
        this.crewService.remember(this.table.id, this.table.name, this.nickname);
        if (night.getTime() !== this.table.time) {
            this.table.time = night.getTime();
            // Fire and forget, like the count: the send itself never waits on it or fails with it.
            this.apiService.crewNight(this.table.id, { time: night.getTime(), by: this.nickname })
                .catch(err => reportError(err, 'crewNight', { crew: this.table.id }));
        }
    }

    /** SEND ON WHATSAPP is a plain link; this only counts it. */
    whatsapp(event: Event) {
        if (!this.ready) {
            event.preventDefault();
            return;
        }
        this.picked('whatsapp');
    }

    /**
     * ADD TO MY CALENDAR: the night as a calendar file, which the phone's calendar opens. The share
     * sheet is not used: this entry is for the guest's own calendar, not for a group chat.
     */
    calendar() {
        if (!this.ready) {
            return;
        }
        const night = this.night;
        const ics = buildEventIcs(night, inviteEvent(night, this.table.id, this.table.name, this.locale), new Date());
        const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = INVITE_FILE;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        this.calendarSaved = true;
        this.picked('calendar');
    }

    google() {
        this.count('google-calendar');
    }

    /** Share another way: the phone's share sheet, or the text and link copied where there is none. */
    async other() {
        if (!this.ready) {
            return;
        }
        const result = await this.shareService.share({
            title: this.t.eventTitle(this.table.name),
            text: this.message,
            url: this.url,
        }, null);
        if (result === 'shared') {
            this.picked('native');
        } else if (result === 'copied') {
            this.copied = true;
            this.picked('copy');
        }
    }

    /** "See who's in": the table's page, where the friends' names arrive. */
    seeTable() {
        // The finished game must not move this phone any more (a rematch there starting, say).
        this.gameService.unregister();
        this.sheet.emit(false);
        this.router.navigate((this.rtl ? ['he'] : []).concat(['c', this.table.id]));
    }

    /** "or start a game right now": today's START MY OWN GAME, as a text link. */
    createNow() {
        this.count('create-now');
        this.gameService.unregister();
        this.router.navigate(['/create-game'], { queryParams: { via: INVITE_NOW_TAG, lang: this.rtl ? 'he' : 'en' } });
    }
}
