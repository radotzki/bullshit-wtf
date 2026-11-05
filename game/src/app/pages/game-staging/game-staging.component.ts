import { reportError } from './../../sentry/sentry.module';
import { GamePlayers, GamePlayer, GameState } from './../../game-model';
import { Subscription } from 'rxjs/Subscription';
import { Howl } from 'howler';
import { ApiService, SIGN_IN_WAIT_MS } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Observable } from 'rxjs/Observable';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { lobbyHost, lobbyText, LobbyText, HOST_GRACE_MS, packBanner, firstFriend } from './lobby-host';

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
    locale = 'en';
    packBanner: string = null;
    private arrivedAt = Date.now();
    private hostLoaded = false;
    private graceTimer: any;
    /** The host has been alone in this lobby, so the first friend in is greeted by name. */
    private wasAlone = false;

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
            this.apiService.getGamePack(this.pin),
            this.presenter ? Promise.resolve(null) : (user && user.uid) ? Promise.resolve(user.uid)
                : this.apiService.uidWithin(SIGN_IN_WAIT_MS).then(r => r.uid),
        ]).then((found: any[]) => {
            const [hasPresenter, creator, locale, pack, myUid] = found;
            this.hasPresenter = !!hasPresenter;
            this.creator = typeof creator === 'string' && creator ? creator : null;
            this.locale = locale === 'he' ? 'he' : 'en';
            this.packBanner = packBanner(pack, this.locale);
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

        if (view.alone) {
            this.wasAlone = true;
        }
        const friend = firstFriend(view, this.players || [], this.myUid, this.wasAlone);
        this.showStartButton = view.canStart;
        this.lobby = lobbyText(view, (this.players || []).length, this.locale, friend);
    }

    ngOnDestroy() {
        this.playersSubscriber.unsubscribe();
        clearTimeout(this.graceTimer);

        if (this.sound) {
            this.sound.fade(1, 0, 1000);
            setTimeout(this.sound.stop, 1000);
        }
    }

    /** "Start alone anyway": counted, so we can see how many lone hosts insist, then a normal start. */
    startAlone() {
        if (this.loading) {
            return;
        }
        this.apiService.logShare('invite', 'solo-start', { locale: this.locale });
        this.startGame();
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
