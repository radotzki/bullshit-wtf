import { reportError } from './../../sentry/sentry.module';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { ApiService } from './../../services/api.service';
import { CrewService } from './../../services/crew.service';
import { ShareService } from './../../services/share.service';
import { StorageService } from './../../services/storage.service';
import {
    NightInfo, buildIcs, buildWeeklyCrewIcs, dateValue, defaultNight, googleCalendarUrl, googleWeeklyUrl, icsFileName,
    nightLabel, nightText, nightTitle, parseNight, timeValue, weekdayName, weeklyFileName, weeklyShareText,
} from './next-night';
import { CrewStrings, crewStrings, localeFromPath } from './crew-strings';
import { NightState, countdown, daysUntil, isIn, nightState, titleLine } from './crew-night';
import { readVisitor } from '../landing/front-door';
import { markHosted } from '../../services/join-source';
import { Crew, CrewMember, GameState, crewStandings, crewLeaderLine, crewNightNames } from './../../game-model';
import { NICKNAME_MAX } from './../../name-flag';

/** How often the page looks at the clock, so "in 2 days" becomes the lobby button by itself. */
const CLOCK_MS = 30 * 1000;

/**
 * A crew's page, at bullshit.wtf/c/<id>: its standings across games and a one-tap rematch.
 * The link is what the group keeps in its chat; anyone with it can start the next game.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-crew',
    templateUrl: './crew.component.html',
    styleUrls: ['./crew.component.scss'],
})
export class CrewComponent implements OnInit, OnDestroy {
    id: string;
    crew: Crew;
    notFound: boolean;
    standings: CrewMember[] = [];
    leader: string;
    loading: boolean;
    errorMsg: string;
    copied: boolean;
    lobbyPin: string;
    lobbyCount = 0;
    nightDate: string;
    nightTime: string;
    nightSent: boolean;
    /** The weekday the weekly entry went into the calendar for, once it did. */
    weeklySentDay: string;
    // WHO'S IN? The crew's stored night (crew.night), by this phone's clock: see crew-night.ts.
    /** The phone's clock, looked at every half minute. */
    now = Date.now();
    /** Who said "I'm in", as the server lists them. */
    inNames: string[] = [];
    /** The name a new phone types before I'M IN. */
    inName = '';
    inLoading: boolean;
    inError: string;
    /** This browser had never played when it opened the page: it gets one line on what the game is. */
    newcomer: boolean;
    readonly nameMax = NICKNAME_MAX;
    private clock: any;
    private nightLocale: string;
    private pathLocale = 'en';
    private crewSub: Subscription;
    private lobbySub: Subscription;
    private lobbyPlayersSub: Subscription;

    constructor(
        private activatedRoute: ActivatedRoute,
        private router: Router,
        private apiService: ApiService,
        private crewService: CrewService,
        private shareService: ShareService,
        private storageService: StorageService,
    ) { }

    ngOnInit() {
        this.id = (this.activatedRoute.snapshot.params['id'] || '').toLowerCase();
        this.pathLocale = localeFromPath(typeof window !== 'undefined' ? window.location.pathname : '');
        // Read before the crew loads: loading it remembers the crew, and then this browser "has played".
        this.newcomer = !readVisitor(key => {
            try {
                return this.storageService.getItem(key);
            } catch (e) {
                return null;
            }
        }).played;
        this.clock = setInterval(() => this.now = Date.now(), CLOCK_MS);
        this.crewSub = this.apiService.getCrewObservable(this.id).subscribe(
            crew => this.onCrew(crew),
            err => { this.notFound = true; reportError(err, 'crew', { crew: this.id }); },
        );
    }

    ngOnDestroy() {
        this.crewSub.unsubscribe();
        this.watchLobby(null);
        clearInterval(this.clock);
    }

    /** The crew's language once it has loaded; until then (or if it is not found), the link's. */
    get locale() {
        if (this.crew) {
            return this.crew.locale === 'he' ? 'he' : 'en';
        }
        return this.pathLocale;
    }

    /** The page's words, in the crew's language. */
    get t(): CrewStrings {
        return crewStrings(this.locale);
    }

    get myNickname() {
        const mine = this.crewService.get(this.id);
        return mine ? mine.nickname : undefined;
    }

    isMe(m: CrewMember) {
        const me = this.myNickname;
        return !!me && m.nickname.toLowerCase() === me.toLowerCase();
    }

    private onCrew(crew: Crew) {
        if (!crew) {
            this.notFound = true;
            this.crew = undefined;
            return;
        }

        this.notFound = false;
        this.crew = crew;
        this.standings = crewStandings(crew);
        this.leader = crewLeaderLine(crew, crew.locale);
        this.inNames = crewNightNames(crew);
        this.now = Date.now();
        this.crewService.remember(crew.id, crew.name);
        this.watchLobby(crew.rematch && crew.rematch.pin);
        // The default night depends on the crew's language, so it is set once the crew is known,
        // and not again on later updates, which would overwrite what the player picked.
        if (this.nightLocale !== this.locale) {
            this.nightLocale = this.locale;
            this.loadNight();
        }
    }

    /** Is a rematch lobby waiting? Then the button says so, and how many are in. */
    private watchLobby(pin: string) {
        if (pin === this.lobbyPin && this.lobbySub) {
            return;
        }
        [this.lobbySub, this.lobbyPlayersSub].forEach(s => s && s.unsubscribe());
        this.lobbySub = this.lobbyPlayersSub = undefined;
        this.lobbyPin = undefined;
        this.lobbyCount = 0;

        if (!pin) {
            return;
        }

        this.lobbySub = this.apiService.gameState(pin).subscribe(state => {
            this.lobbyPin = state === GameState.GameStaging ? pin : undefined;
        });
        this.lobbyPlayersSub = this.apiService.getPlayersObservable(pin).subscribe(players => {
            this.lobbyCount = Object.keys(players || {}).length;
        });
    }

    async rematch(fromNight = false) {
        if (fromNight) {
            this.count('open-lobby');
        }
        this.loading = true;
        this.errorMsg = '';

        try {
            const { pin, created } = await this.apiService.crewRematch(this.id);
            if (created) {
                markHosted(pin);
            }
            const prefix = this.locale === 'he' ? ['he'] : [];
            this.router.navigate(prefix.concat(['join-game', pin]), { queryParams: { via: 'crew' } });
        } catch (err) {
            this.errorMsg = this.t.rematchFailed || (err && err.message);
            reportError(err, 'crewRematch', { crew: this.id });
        }

        this.loading = false;
    }

    get inviteText() {
        const t = this.crewService.strings(this.locale);
        return t.inviteText(this.crew ? this.crew.name : '', this.leader || '');
    }

    get crewUrl() {
        return this.crewService.crewUrl(this.id, this.locale);
    }

    get whatsappUrl() {
        return this.shareService.whatsappUrl(this.inviteText, this.crewUrl);
    }

    get canShare() {
        return this.shareService.canShare;
    }

    async share() {
        const t = this.crewService.strings(this.locale);
        const result = await this.shareService.share({
            title: t.inviteTitle(this.crew ? this.crew.name : ''),
            text: this.inviteText,
            url: this.crewUrl,
        }, 'crew');
        this.copied = result === 'copied';
    }

    whatsapp() {
        this.shareService.track('whatsapp', 'crew');
    }

    // WHO'S IN? The night the crew has stored: its date, who is in, and on the night the lobby button.

    private get storedNight(): number {
        return this.crew && this.crew.night ? this.crew.night.time : undefined;
    }

    get nightState(): NightState {
        return nightState(this.storedNight, this.now, this.crew ? this.crew.lastPlayed : undefined);
    }

    /** "Friday 20 November, 21:00" */
    get storedWhen() {
        return this.storedNight ? nightLabel(new Date(this.storedNight), this.locale) : '';
    }

    get countdown() {
        return this.storedNight ? countdown(this.storedNight, this.now, this.locale) : '';
    }

    /** "Dana holds the title", or the leader line when the top is tied or nobody has won yet. */
    get titleLine() {
        return titleLine(this.standings, this.leader, this.locale);
    }

    get amIn() {
        return isIn(this.inNames, this.myNickname);
    }

    /** "You're in. See you Friday." (or "tonight", when the night is today). */
    get youreIn() {
        const today = daysUntil(this.storedNight, this.now) <= 0;
        return this.t.youreIn(today ? '' : weekdayName(new Date(this.storedNight), this.locale));
    }

    /** Presses on the night block, counted in BigQuery `shares`. A test crew's presses are not counted. */
    private count(method: string) {
        if (this.crew && !this.crew.test) {
            this.apiService.logShare('crew-night', method, { crew: this.id, locale: this.locale });
        }
    }

    /** I'M IN: one tap for a phone the crew knows, a name first for a new one. */
    async imIn() {
        const nickname = (this.myNickname || this.inName || '').trim();
        if (!nickname || this.inLoading) {
            return;
        }
        this.inLoading = true;
        this.inError = '';
        try {
            const resp = await this.apiService.crewNight(this.id, { nickname, in: true });
            // The phone is known by this name from now on, here and at the crew's next lobby.
            this.crewService.remember(this.id, this.crew.name, resp.nickname || nickname);
            this.inName = '';
            this.count(resp.isNew ? 'in-new' : 'in');
        } catch (err) {
            // A refused name comes with the server's own words, in the crew's language.
            this.inError = err && err.code === 'BAD_NAME' && err.message ? err.message : this.t.inFailed;
            if (!err || ['BAD_NAME', 'NIGHT_FULL', 'NO_NIGHT'].indexOf(err.code) < 0) {
                reportError(err, 'crewNight', { crew: this.id });
            }
        }
        this.inLoading = false;
    }

    /** "Can't make it": takes the name off the list. */
    async imOut() {
        const nickname = this.myNickname;
        if (!nickname || this.inLoading) {
            return;
        }
        this.inLoading = true;
        this.inError = '';
        try {
            await this.apiService.crewNight(this.id, { nickname, in: false });
            this.count('out');
        } catch (err) {
            this.inError = this.t.inFailed;
            reportError(err, 'crewNight', { crew: this.id });
        }
        this.inLoading = false;
    }

    /** Offered once two or more are in: one name alone is no news for the group. */
    get canNudge() {
        return this.inNames.length >= 2;
    }

    /** ASK WHO ELSE IS IN: a WhatsApp text naming who is in, with the crew link. The player's own tap and chat. */
    get nudgeUrl() {
        return this.shareService.whatsappUrl(this.t.nudgeText(this.inNames.length, this.storedWhen, this.inNames), this.crewUrl);
    }

    nudged() {
        this.shareService.track('whatsapp', 'crew-night');
        this.count('nudge');
    }

    get storedGoogleUrl() {
        return this.storedNight ? googleCalendarUrl(new Date(this.storedNight), this.nightInfo) : '';
    }

    /** ADD TO MY CALENDAR: the stored night as a calendar file, for this phone's own calendar. */
    addToCalendar() {
        const info = this.nightInfo;
        this.downloadIcs(buildIcs(new Date(this.storedNight), info, this.id, new Date()), icsFileName(info.crewName));
        this.count('calendar-download');
    }

    addToGoogle() {
        this.count('google-calendar');
    }

    /** PICK A NIGHT: down to the date inputs the page already has. */
    pickNight() {
        const inputs = typeof document !== 'undefined' ? document.querySelector('.next-night') : null;
        if (inputs && inputs.scrollIntoView) {
            inputs.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        const date = inputs ? inputs.querySelector('input') : null;
        if (date) {
            date.focus({ preventScroll: true });
        }
    }

    // Next game night: a date the group agrees on, sent as a calendar file and a WhatsApp text.
    // Sending it also stores it on the crew (crewNight), so the page becomes the door to that night.

    private get nightKey() {
        return `BS_NIGHT_${this.id}`;
    }

    private loadNight() {
        let saved: Date;
        try {
            const t = +this.storageService.getItem(this.nightKey);
            saved = t > Date.now() ? new Date(t) : undefined;
        } catch (e) { }
        // The night the crew has stored, while it is still ahead, comes before this phone's last pick.
        const stored = this.storedNight > Date.now() ? new Date(this.storedNight) : undefined;
        const d = stored || saved || defaultNight(new Date(), this.locale);
        this.nightDate = dateValue(d);
        this.nightTime = timeValue(d);
    }

    get night(): Date {
        return parseNight(this.nightDate, this.nightTime);
    }

    get nightInPast() {
        const d = this.night;
        return !!d && d.getTime() < Date.now();
    }

    get nightReady() {
        return !!this.night && !this.nightInPast && !!this.crew;
    }

    get nightWhen() {
        const d = this.night;
        return d ? nightLabel(d, this.locale) : '';
    }

    private get nightInfo(): NightInfo {
        return {
            crewName: this.crew ? this.crew.name : '',
            leader: this.leader || '',
            url: this.crewUrl,
            locale: this.locale,
        };
    }

    private nightPicked(how: string) {
        try {
            this.storageService.setItem(this.nightKey, String(this.night.getTime()));
        } catch (e) { }
        this.nightSent = true;
        this.shareService.track(how, 'crew-night');
        this.apiService.logShare('crew-night', how, { crew: this.id, locale: this.locale });
        // Fire and forget, like the count: the send itself never waits on it or fails with it.
        this.apiService.crewNight(this.id, { time: this.night.getTime(), by: this.myNickname })
            .catch(err => reportError(err, 'crewNight', { crew: this.id }));
    }

    get nightWhatsappUrl() {
        return this.nightReady ? this.shareService.whatsappUrl(nightText(this.night, this.nightInfo), this.crewUrl) : '';
    }

    get nightGoogleUrl() {
        return this.nightReady ? googleCalendarUrl(this.night, this.nightInfo) : '';
    }

    nightWhatsapp() {
        this.nightPicked('whatsapp');
    }

    nightGoogle() {
        this.nightPicked('google-calendar');
    }

    /** Phones with a share sheet send the .ics into the group chat; elsewhere it downloads. */
    async nightCalendar() {
        if (!this.nightReady) {
            return;
        }
        const info = this.nightInfo;
        const ics = buildIcs(this.night, info, this.id, new Date());
        const name = icsFileName(info.crewName);
        let file: File;
        try {
            file = new File([ics], name, { type: 'text/calendar' });
        } catch (e) { }

        if (file && this.shareService.canShareFiles([file])) {
            const result = await this.shareService.share({
                title: nightTitle(info),
                text: `${nightText(this.night, info)}\n${this.crewUrl}`,
                files: [file],
            }, null);
            if (result === 'shared') {
                this.nightPicked('calendar-share');
                return;
            }
            if (result === 'cancelled') {
                return;
            }
        }

        this.downloadIcs(ics, name);
        this.nightPicked('calendar-download');
    }

    // Every week: the same night as a repeating calendar entry, with the crew's link in it.

    /** "Friday" / "יום שישי": the weekday of the picked night. */
    get weeklyDay() {
        const d = this.night;
        return d ? weekdayName(d, this.locale) : '';
    }

    get weeklyGoogleUrl() {
        if (!this.nightReady) {
            return '';
        }
        let zone: string;
        try {
            zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) { }
        return googleWeeklyUrl(this.night, this.nightInfo, zone);
    }

    private weeklyPicked(how: string) {
        this.weeklySentDay = this.weeklyDay;
        this.shareService.track(how, 'crew-weekly');
        this.apiService.logShare('crew-night', how, { crew: this.id, locale: this.locale });
    }

    weeklyGoogle() {
        this.weeklyPicked('weekly-google');
    }

    /** Like the one-night invite: a share sheet sends the file to the group, elsewhere it downloads. */
    async weeklyCalendar() {
        if (!this.nightReady) {
            return;
        }
        const info = this.nightInfo;
        const ics = buildWeeklyCrewIcs(this.night, info, this.id, new Date());
        const name = weeklyFileName(info.crewName);
        let file: File;
        try {
            file = new File([ics], name, { type: 'text/calendar' });
        } catch (e) { }

        if (file && this.shareService.canShareFiles([file])) {
            const result = await this.shareService.share({
                title: nightTitle(info),
                text: `${weeklyShareText(this.night, info)}\n${this.crewUrl}`,
                files: [file],
            }, null);
            if (result === 'shared') {
                this.weeklyPicked('weekly-share');
                return;
            }
            if (result === 'cancelled') {
                return;
            }
        }

        this.downloadIcs(ics, name);
        this.weeklyPicked('weekly-download');
    }

    private downloadIcs(ics: string, name: string) {
        const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
}
