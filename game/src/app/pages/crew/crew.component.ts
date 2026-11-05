import { reportError } from './../../sentry/sentry.module';
import { Subscription } from 'rxjs/Subscription';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ApiService } from './../../services/api.service';
import { CrewService } from './../../services/crew.service';
import { ShareService } from './../../services/share.service';
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
    private crewSub: Subscription;
    private lobbySub: Subscription;
    private lobbyPlayersSub: Subscription;

    constructor(
        private activatedRoute: ActivatedRoute,
        private router: Router,
        private apiService: ApiService,
        private crewService: CrewService,
        private shareService: ShareService,
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
}
