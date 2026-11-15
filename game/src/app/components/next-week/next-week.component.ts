import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiService } from './../../services/api.service';
import { CrewService } from './../../services/crew.service';
import { ShareService } from './../../services/share.service';
import { StorageService } from './../../services/storage.service';
import { reportError } from './../../sentry/sentry.module';
import { Crew, CrewNight, crewLeaderLine, crewStandings } from './../../game-model';
import { nameFlag, crewNameRefused } from './../../name-flag';
import {
    NightInfo, buildIcs, dateValue, googleCalendarUrl, icsFileName, nightLabel, parseNight, timeValue,
} from './../../pages/crew/next-night';
import { crewStrings } from './../../pages/crew/crew-strings';
import { askStrings } from './../host-ask/host-ask';
import {
    NextWeekStrings, defaultCrewName, isIn, nextWeekText, nextWeekView, nextWeekWords, sameTimeNextWeek,
} from './next-week';

/**
 * "Same time next week?" on the final screen (see next-week.ts): the button beside REMATCH, its
 * sheet, and the banner every phone gets once one player has set the date.
 * Every press is counted in BigQuery's shares table as content_type "next-week".
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-next-week',
    templateUrl: './next-week.component.html',
    styleUrls: ['./next-week.component.scss'],
})
export class NextWeekComponent implements OnChanges, OnDestroy {
    @Input() pin: string;
    @Input() locale = 'en';
    /** The game's crew, once it has one (the sheet makes it). */
    @Input() crewId: string;
    /** This player's nickname as the game shows it. */
    @Input() myNickname: string;
    /** The host's nickname, for the crew's default name. */
    @Input() hostName: string;
    /** This player won the game, or is tied for first. */
    @Input() winner: boolean;
    /** The sheet opened (true) or closed (false): the final screen keeps the player here while it is open. */
    @Output() sheet = new EventEmitter<boolean>();
    /** The crew's name, as it is read and whenever it changes. */
    @Output() named = new EventEmitter<string>();

    crew: Crew;
    open: boolean;
    /** The crew is being made. */
    making: boolean;
    failed: boolean;
    /** This phone made the crew just now, with a uid: it may still change the name. */
    private mine: boolean;
    crewName = '';
    nameError: string;
    changing: boolean;
    nightDate: string;
    nightTime: string;
    /** This phone sent or saved the date. */
    sent: boolean;
    copied: boolean;
    /** ADD TO MY CALENDAR was pressed: offer Google Calendar for phones that ignore the file. */
    calendarUrl: string;
    /** I'M IN was pressed (the crew's list follows a moment later). */
    private saidIn: boolean;
    private id: string;
    private crewSub: Subscription;

    constructor(
        private apiService: ApiService,
        private crewService: CrewService,
        private shareService: ShareService,
        private storageService: StorageService,
    ) { }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['crewId']) {
            this.watchCrew(this.crewId);
        }
    }

    ngOnDestroy() {
        if (this.crewSub) {
            this.crewSub.unsubscribe();
        }
    }

    private watchCrew(id: string) {
        id = (id || '').toLowerCase();
        if (!id || id === this.id) {
            return;
        }
        this.id = id;
        if (this.crewSub) {
            this.crewSub.unsubscribe();
        }
        this.crewSub = this.apiService.getCrewObservable(id).subscribe(crew => {
            this.crew = crew || undefined;
            if (crew && crew.name) {
                this.named.emit(crew.name);
            }
            // The name as the crew has it, unless this player is typing their own.
            if (crew && (!this.canRename || !this.crewName)) {
                this.crewName = crew.name;
            }
        }, () => null);
    }

    get t(): NextWeekStrings {
        return nextWeekWords(this.locale);
    }

    get rtl() {
        return this.locale === 'he';
    }

    private get lang() {
        return this.rtl ? 'he' : 'en';
    }

    /** Words the crew page and the after-game ask already have. */
    get crewWords() {
        return crewStrings(this.lang);
    }

    get calendarSaved() {
        return askStrings(this.lang).saved;
    }

    private count(method: string) {
        this.apiService.logShare('next-week', method, { crew: this.id, locale: this.lang });
    }

    // ---- the button and the banner ----

    private get setNight(): CrewNight {
        return this.crew && this.crew.night ? this.crew.night : undefined;
    }

    /** The banner once the crew has a night that is still to come (and the sheet is closed). */
    get banner(): boolean {
        return !this.open && nextWeekView(this.setNight && this.setNight.time, new Date()) === 'banner';
    }

    get bannerWhen() {
        return this.setNight ? nightLabel(new Date(this.setNight.time), this.lang) : '';
    }

    get bannerBy() {
        return this.setNight && this.setNight.by ? this.t.call(this.setNight.by) : '';
    }

    get imIn(): boolean {
        return !!this.saidIn || !!this.sent || isIn(this.setNight, this.myNickname);
    }

    sayIn() {
        if (!this.id || !this.myNickname || this.saidIn) {
            return;
        }
        this.saidIn = true;
        this.apiService.crewNight(this.id, { nickname: this.myNickname, in: true }).catch(err => {
            this.saidIn = false;
            reportError(err, 'crewNight', { crew: this.id });
        });
        this.count('in');
    }

    bannerCalendar() {
        if (this.setNight) {
            this.saveCalendar(new Date(this.setNight.time));
            this.count('calendar');
        }
    }

    // ---- the sheet ----

    async openSheet() {
        this.open = true;
        this.sheet.emit(true);
        this.copied = false;
        this.failed = false;
        if (!this.nightDate) {
            const d = sameTimeNextWeek(new Date());
            this.nightDate = dateValue(d);
            this.nightTime = timeValue(d);
        }
        this.count('open');
        if (this.id || this.making) {
            return;
        }
        // The crew is made now, so the WhatsApp button is a plain link by the time it is pressed.
        this.making = true;
        this.crewName = defaultCrewName(this.hostName || this.myNickname, this.lang);
        try {
            const made = await this.apiService.createCrew(this.pin, this.crewName, true);
            this.mine = !!made.created;
            if (made.created) {
                this.apiService.logShare('crew-save', 'next-week', { crew: made.id, locale: this.lang });
            } else {
                this.crewName = made.name;
            }
            this.watchCrew(made.id);
            this.crewService.remember(made.id, made.name, this.myNickname);
        } catch (err) {
            this.failed = true;
            reportError(err, 'createCrew', { pin: this.pin });
        }
        this.making = false;
    }

    close() {
        this.saveName();
        this.open = false;
        this.changing = false;
        this.sheet.emit(false);
    }

    /** Only the phone that made the crew just now, signed in, may name it (the server checks the same). */
    get canRename(): boolean {
        return !!this.mine && !!this.crew && this.crew.auto === true && !!this.crew.creator;
    }

    onName() {
        const name = (this.crewName || '').trim();
        this.nameError = name && nameFlag(name) ? crewNameRefused(this.lang) : '';
    }

    /** Sends a changed name to the server. An empty or refused name keeps the one the crew has. */
    private saveName() {
        const name = (this.crewName || '').replace(/\s+/g, ' ').trim();
        if (!this.canRename || !name || this.nameError || name === this.crew.name) {
            return;
        }
        this.apiService.createCrew(this.pin, name, true).catch(() => null);
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
        return d ? nightLabel(d, this.lang) : '';
    }

    /** The crew is there and the date is good: the send buttons work. */
    get ready(): boolean {
        return !!this.id && !!this.crew && !!this.night && !this.nightInPast && !this.nameError;
    }

    get crewUrl() {
        return this.id ? this.crewService.crewUrl(this.id, this.lang) : '';
    }

    /** "Dana leads 2 to 1", tonight's games counted; nothing while nobody has won a game. */
    private get leader() {
        const first = this.crew ? crewStandings(this.crew)[0] : undefined;
        return first && first.wins > 0 ? crewLeaderLine(this.crew, this.lang) : '';
    }

    get text() {
        return this.night ? nextWeekText({ winner: !!this.winner, when: this.night, leader: this.leader, locale: this.lang }) : '';
    }

    get whatsappUrl() {
        return this.ready ? this.shareService.whatsappUrl(this.text, this.crewUrl) : '';
    }

    get canShare() {
        return this.shareService.canShare;
    }

    /** The date was sent or saved: it goes on the crew, where every phone on the final screen reads it. */
    private commit(method: 'whatsapp' | 'native' | 'copy' | 'calendar') {
        const night = this.night;
        this.saveName();
        this.sent = true;
        this.count(method);
        // Fire and forget, like the count: the send itself never waits on it.
        this.apiService.crewNight(this.id, { time: night.getTime(), by: this.myNickname || '' })
            .catch(err => reportError(err, 'crewNight', { crew: this.id }));
        try {
            // The crew page offers the same night to this phone.
            this.storageService.setItem(`BS_NIGHT_${this.id}`, String(night.getTime()));
        } catch (e) { }
    }

    whatsapp() {
        if (this.ready) {
            this.commit('whatsapp');
        }
    }

    async other() {
        if (!this.ready) {
            return;
        }
        const result = await this.shareService.share({ title: this.t.title, text: this.text, url: this.crewUrl }, null);
        this.copied = result === 'copied';
        if (result === 'shared') {
            this.commit('native');
        } else if (result === 'copied') {
            this.commit('copy');
        }
    }

    calendar() {
        if (this.ready) {
            this.saveCalendar(this.night);
            this.commit('calendar');
        }
    }

    /**
     * One entry for that night, with the crew link: the calendar file the crew page makes, saved to
     * this player's own calendar, and the Google Calendar link for phones that do nothing with the file.
     */
    private saveCalendar(start: Date) {
        const name = (this.crew && this.crew.name) || this.crewName;
        const info: NightInfo = { crewName: name, leader: this.leader, url: this.crewUrl, locale: this.lang };
        this.calendarUrl = googleCalendarUrl(start, info);
        const url = URL.createObjectURL(new Blob([buildIcs(start, info, this.id, new Date())], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = icsFileName(name);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
}
