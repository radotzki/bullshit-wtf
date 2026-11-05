import { reportError } from './../../sentry/sentry.module';
import { GamePlayers, GamePlayer, GameState } from './../../game-model';
import { Subscription } from 'rxjs/Subscription';
import { Howl } from 'howler';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Observable } from 'rxjs/Observable';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { lobbyHost, lobbyText, LobbyText, HOST_GRACE_MS } from './lobby-host';

@Component({
    selector: 'app-game-staging',
    templateUrl: './game-staging.component.html',
    styleUrls: ['./game-staging.component.scss']
})
export class GameStagingComponent implements OnInit, OnDestroy {
    players: GamePlayer[];
    playersSubscriber: Subscription;
    pin: string;
    presenter: boolean;
    errorMsg: string;
    loading: boolean;
    showStartButton: boolean;
    lobby: LobbyText;
    sound: Howl;

    private hasPresenter: boolean;
    private creator: string = null;
    private myUid: string = null;
    private locale = 'en';
    private arrivedAt = Date.now();
    private hostLoaded = false;
    private graceTimer: any;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameService.register(this.pin);
        this.playMusic();
        this.playersSubscriber = this.apiService.getPlayersObservable(this.pin)
            .map(players => Object.keys(players || {}).map(k => players[k]))
            .subscribe(players => {
                this.players = players;
                this.updateLobby();
            });
        this.loadHost();
    }

    /** Find out who may start: the big screen, the game's creator, or (if unknown) anyone. */
    private loadHost() {
        const user = this.sessionService.user;
        const optional = (p: Promise<any>, fallback: any) => p.catch(() => fallback);

        Promise.all([
            this.apiService.gameHasPresenter(this.pin),
            // Unreadable until the database rules that expose `creator` are deployed.
            optional(this.apiService.getGameCreator(this.pin), null),
            optional(this.apiService.getGameLocale(this.pin), 'en'),
            this.presenter ? Promise.resolve(null) : (user && user.uid) ? Promise.resolve(user.uid) : this.apiService.currentUid(),
        ]).then((found: any[]) => {
            const [hasPresenter, creator, locale, myUid] = found;
            this.hasPresenter = !!hasPresenter;
            this.creator = typeof creator === 'string' && creator ? creator : null;
            this.locale = locale === 'he' ? 'he' : 'en';
            this.myUid = typeof myUid === 'string' && myUid ? myUid : null;
            this.hostLoaded = true;
            this.updateLobby();
            // Re-check once the host's grace period is over, in case the host never joins.
            this.graceTimer = setTimeout(() => this.updateLobby(), HOST_GRACE_MS + 500);
        }).catch(err => {
            reportError(err, 'lobbyHost', { pin: this.pin });
            this.showStartButton = true;
        });
    }

    private updateLobby() {
        if (!this.hostLoaded) {
            return;
        }

        const view = lobbyHost({
            hasPresenter: this.hasPresenter,
            isPresenter: this.presenter,
            creator: this.creator,
            myUid: this.myUid,
            players: this.players || [],
            waitedMs: Date.now() - this.arrivedAt,
        });

        this.showStartButton = view.canStart;
        this.lobby = lobbyText(view, (this.players || []).length, this.locale);
    }

    ngOnDestroy() {
        this.playersSubscriber.unsubscribe();
        clearTimeout(this.graceTimer);

        if (this.sound) {
            this.sound.fade(1, 0, 1000);
            setTimeout(this.sound.stop, 1000);
        }
    }

    startGame() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.tick(this.pin, GameState.RoundIntro)
            .catch(err => {
                this.loading = false;
                reportError(err, 'startGame', { pin: this.pin });
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }

    playMusic() {
        if (this.presenter) {
            this.sound = new Howl({
                src: ['/assets/sounds/staging.mp3'],
                autoplay: true,
                loop: true,
            });
        }
    }
}
