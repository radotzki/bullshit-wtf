import { reportError } from './../../sentry/sentry.module';
import { Subscription } from 'rxjs/Subscription';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ApiService } from './../../services/api.service';
import { CrewService } from './../../services/crew.service';
import { ShareService } from './../../services/share.service';
import { StorageService } from './../../services/storage.service';
import {
    NightInfo, buildIcs, dateValue, defaultNight, googleCalendarUrl, icsFileName, nightLabel, nightText,
    nightTitle, parseNight, timeValue,
} from './next-night';
import { markHosted } from '../../services/join-source';
import { Crew, CrewMember, GameState, crewStandings, crewLeaderLine } from './../../game-model';

/**
 * A crew's page, at bullshit.wtf/c/<id>: its standings across games and a one-tap rematch.
 * The link is what the group keeps in its chat; anyone with it can start the next game.
 */
@Component({
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
    private nightLocale: string;
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
        this.crewSub = this.apiService.getCrewObservable(this.id).subscribe(
            crew => this.onCrew(crew),
            err => { this.notFound = true; reportError(err, 'crew', { crew: this.id }); },
        );
    }

    ngOnDestroy() {
        this.crewSub.unsubscribe();
        this.watchLobby(null);
    }

    get locale() {
        return this.crew && this.crew.locale === 'he' ? 'he' : 'en';
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

    async rematch() {
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
            this.errorMsg = err && err.message;
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

    // Next game night: a date the group agrees on, sent as a calendar file and a WhatsApp text.
    // This browser remembers the last date it picked for the crew; nothing goes to the server.

    private get nightKey() {
        return `BS_NIGHT_${this.id}`;
    }

    private loadNight() {
        let saved: Date;
        try {
            const t = +this.storageService.getItem(this.nightKey);
            saved = t > Date.now() ? new Date(t) : undefined;
        } catch (e) { }
        const d = saved || defaultNight(new Date(), this.locale);
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
