import { map } from 'rxjs/operators';
import { reportError } from './../../sentry/sentry.module';
import { Subscription } from 'rxjs';
import { Howl } from 'howler';
import { fadeOutAndUnload } from './../fade-out';
import { ApiService, SIGN_IN_WAIT_MS } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { swapToast } from './../../name-flag';
import { packIcon } from './../../game-model';
import { lobbyHost, lobbyText, LobbyText, LobbyPlayer, HOST_GRACE_MS, HOST_PING_MS, packBanner, firstFriend,
    hostAwayMs, shouldAskClock } from './lobby-host';
import { gameStrings, GameStrings } from './../game-strings';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-game-staging',
    templateUrl: './game-staging.component.html',
    styleUrls: ['./game-staging.component.scss']
})
export class GameStagingComponent implements OnInit, OnDestroy {
    players: LobbyPlayer[];
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
    private hasHost = false;
    private myUid: string = null;
    private myPid: string = null;
    locale = 'en';
    t: GameStrings = gameStrings('en');
    packBanner: string = null;
    packIcon = '🕎';
    /** Only on the phone whose nickname the server swapped, once: why it has a sweet name now. */
    nameToast: string = null;
    private toastTimer: any;
    private arrivedAt = Date.now();
    private hostLoaded = false;
    private graceTimer: any;
    /** Server time the host's lobby page last reported in, and how far this clock is ahead of the server's. */
    private hostSeen: number = null;
    private clockAhead: number = null;
    private askingClock = false;
    /** The lobby was left: a clock answer that arrives later changes nothing. */
    private left = false;
    private clockAskedAt: number = null;
    private hostSeenSubscriber: Subscription;
    private pingTimer: any;
    private lobbyTimer: any;
    /** The host has been alone in this lobby, so the first friend in is greeted by name. */
    private wasAlone = false;
    private onVisible = () => {
        if (!document.hidden) {
            this.reportIn();
        }
    };

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.t = gameStrings(this.apiService.knownGameLocale(this.pin));
        this.gameService.register(this.pin);
        this.playMusic();
        this.playersSubscriber = this.apiService.getPlayersObservable(this.pin)
            .pipe(map(players => Object.keys(players || {}).map(k => Object.assign({}, players[k], { pid: k }))))
            .subscribe(players => {
                this.players = players;
                this.updateLobby();
            });
        this.loadHost();
        this.watchHost();
    }

    /**
     * A joined host whose phone dies must not leave the group stuck. The host's page reports in
     * every HOST_PING_MS (and as soon as it is back on screen); other phones watch that time and
     * get START once the host has been gone HOST_GONE_MS. The server checks the same.
     */
    private watchHost() {
        if (this.apiService.holdsHostKey(this.pin)) {
            this.reportIn();
            this.pingTimer = setInterval(() => this.reportIn(), HOST_PING_MS);
            document.addEventListener('visibilitychange', this.onVisible);
            return;
        }
        this.askClock();
        // Unreadable until the database rules that expose `hostSeen` are deployed: then nobody is gone.
        this.hostSeenSubscriber = this.apiService.getHostSeenObservable(this.pin).subscribe(seen => {
            this.hostSeen = typeof seen === 'number' ? seen : null;
            this.updateLobby();
        }, () => null);
        this.lobbyTimer = setInterval(() => {
            this.askClock();
            this.updateLobby();
        }, 5000);
    }

    /** Learn how far this phone's clock is from the server's. Unknown (null) after a failed call: asked again later. */
    private askClock() {
        if (!shouldAskClock(this.clockAhead, this.askingClock, this.clockAskedAt, Date.now())) {
            return;
        }
        this.askingClock = true;
        this.clockAskedAt = Date.now();
        // clockAhead() always settles: a hung request counts as failed after CLOCK_TIMEOUT_MS (clock-sync.ts).
        this.apiService.clockAhead().then(ahead => {
            this.askingClock = false;
            if (this.left) {
                return;
            }
            this.clockAhead = typeof ahead === 'number' ? ahead : null;
            this.updateLobby();
        }).catch(() => {
            this.askingClock = false;
        });
    }

    private reportIn() {
        this.apiService.hostHere(this.pin).catch(() => null);
    }

    /** Find out who may start: the game's host, or (if unknown) the big screen or anyone. */
    private loadHost() {
        const user = this.sessionService.user;
        const optional = (p: Promise<any>, fallback: any) => p.catch(() => fallback);

        Promise.all([
            this.apiService.gameHasPresenter(this.pin),
            // Unreadable until the database rules that expose `creator` are deployed.
            optional(this.apiService.getGameCreator(this.pin), null),
            optional(this.apiService.getGameHasHost(this.pin), false),
            optional(this.apiService.getGameLocale(this.pin), 'en'),
            this.apiService.getGamePack(this.pin),
            this.presenter ? Promise.resolve(null) : (user && user.uid) ? Promise.resolve(user.uid)
                : this.apiService.uidWithin(SIGN_IN_WAIT_MS).then(r => r.uid),
        ]).then((found: any[]) => {
            const [hasPresenter, creator, hasHost, locale, pack, myUid] = found;
            this.hasPresenter = !!hasPresenter;
            this.creator = typeof creator === 'string' && creator ? creator : null;
            this.hasHost = hasHost === true;
            this.myPid = !this.presenter && user && user.pid ? user.pid : null;
            this.locale = locale === 'he' ? 'he' : 'en';
            this.t = gameStrings(this.locale);
            this.packBanner = packBanner(pack, this.locale);
            this.packIcon = packIcon(pack);
            this.showNameToast();
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

    private showNameToast() {
        const swap = this.sessionService.nameSwap;
        if (this.presenter || !swap || swap.pin !== String(this.pin || '').toUpperCase()) {
            return;
        }
        this.sessionService.nameSwap = null;
        this.nameToast = swapToast(swap.nickname, this.locale);
        this.toastTimer = setTimeout(() => this.nameToast = null, 9000);
    }

    hideNameToast() {
        this.nameToast = null;
        clearTimeout(this.toastTimer);
    }

    private updateLobby() {
        if (!this.hostLoaded) {
            return;
        }

        const view = lobbyHost({
            hasPresenter: this.hasPresenter,
            isPresenter: this.presenter,
            holdsHostKey: this.apiService.holdsHostKey(this.pin),
            creator: this.creator,
            hasHost: this.hasHost,
            myUid: this.myUid,
            myPid: this.myPid,
            players: this.players || [],
            waitedMs: Date.now() - this.arrivedAt,
            hostAwayMs: hostAwayMs(Date.now(), this.clockAhead, this.hostSeen),
        });

        if (view.alone) {
            this.wasAlone = true;
        }
        const friend = firstFriend(view, this.players || [], this.myUid, this.wasAlone, this.myPid);
        this.showStartButton = view.canStart;
        this.lobby = lobbyText(view, (this.players || []).length, this.locale, friend);
    }

    ngOnDestroy() {
        this.left = true;
        this.playersSubscriber.unsubscribe();
        clearTimeout(this.graceTimer);
        clearTimeout(this.toastTimer);
        clearInterval(this.pingTimer);
        clearInterval(this.lobbyTimer);
        document.removeEventListener('visibilitychange', this.onVisible);
        if (this.hostSeenSubscriber) {
            this.hostSeenSubscriber.unsubscribe();
        }

        if (this.sound) {
            fadeOutAndUnload(this.sound);
        }
    }

    /**
     * "Try 5 quick questions alone": counted as before (invite, solo-start), then a normal start.
     * The server makes a game that starts with one player a taste (see TASTE_QUESTIONS in game-model).
     */
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

        this.apiService.startGame(this.pin)
            .catch(err => {
                this.loading = false;
                if (err && err.code === 'NOT_HOST') {
                    // Only the host's phone may start this game; the server said this is not it.
                    this.errorMsg = this.t.onlyHostStarts;
                    return;
                }
                reportError(err, 'startGame', { pin: this.pin });
                this.errorMsg = this.t.oops;
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
