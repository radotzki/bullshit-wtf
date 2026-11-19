import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { ActivatedRoute, Router } from '@angular/router';
import {
    Component, OnInit, OnDestroy, AfterViewInit, Input, Output, EventEmitter, ChangeDetectionStrategy, ElementRef, ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { GameState } from './../../game-model';
import { SoundService } from './../../services/sound.service';
import { gameStrings, GameStrings } from './../../pages/game-strings';
import { hostStrings, HostStrings, HostSeatRow, hostSeatRows, seatRemoved, remoteLink } from './../../pages/host-strings';
import { PairingView } from './../../services/api.service';
import { GamePlayers } from './../../game-model';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-game-header',
    templateUrl: './game-header.component.html',
    styleUrls: ['./game-header.component.scss']
})
export class GameHeaderComponent implements OnInit, OnDestroy, AfterViewInit {
    pin: string;
    /** The game's words: the header follows the game's language, like every game screen. */
    t: GameStrings = gameStrings('en');
    private round: number = null;
    private questionOf: number[] = null;
    private stateSeen = false;
    private localeSeen = false;
    gameOver: boolean;
    registration: boolean;
    gameSubscription: Subscription;
    loading: boolean;
    presenter: boolean;
    showGoHomeModal: boolean;
    /** A phone that plays the game's sounds (a staged-reveal game with no big screen) gets a mute button. */
    soundButton = false;
    /** The host's controls (host-strings.ts): this browser holds the game's host key. */
    host = false;
    h: HostStrings = hostStrings('en');
    showPlayers = false;
    seats: HostSeatRow[] = [];
    removing: HostSeatRow = null;
    removeBusy = false;
    removeError = false;
    /** This phone's seat was removed by the host: it stops following the game and says so. */
    removed = false;
    private hadSeat = false;
    /** The big screen's pairing of the host's phone ("on a second device" in host-controls.ts). */
    showRemote = false;
    pairing: PairingView = null;
    pairDigits = '';
    pairBusy = false;
    pairError: string = null;
    private pairPoll: any = null;
    @ViewChild('remoteModal') private remoteModal: ElementRef<HTMLElement>;
    private playersSubscription: Subscription;
    @Input() button: string;
    @Input() buttonLoading: boolean;
    @Output() onClick: EventEmitter<any> = new EventEmitter();

    constructor(
        private activatedRoute: ActivatedRoute,
        private sessionService: SessionService,
        private apiService: ApiService,
        private router: Router,
        private gameService: GameService,
        private soundService: SoundService,
    ) { }

    ngOnInit() {
        this.loading = true;
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.t = gameStrings(this.apiService.knownGameLocale(this.pin));
        // The header shows once the game's language is known, so a Hebrew game never flashes English.
        this.h = hostStrings(this.apiService.knownGameLocale(this.pin));
        const known = (locale: string) => {
            this.t = gameStrings(locale);
            this.h = hostStrings(locale);
            this.localeSeen = true;
            this.loading = !this.stateSeen;
        };
        this.apiService.getGameLocale(this.pin).then(known, () => known('en'));
        this.gameSubscription = this.apiService.gameState(this.pin).subscribe(this.onStateChange.bind(this));
        this.host = !!this.pin && this.apiService.holdsHostKey(this.pin);
        if (this.pin && (this.host || !this.presenter)) {
            this.playersSubscription = this.apiService.getPlayersObservable(this.pin).subscribe(players => this.onPlayers(players));
        }

        if (!this.presenter && this.pin) {
            this.apiService.phoneSound(this.pin).then(sound => {
                this.soundButton = sound;
                if (sound) {
                    // Download the sounds now; the phone lets them play after the player's next tap.
                    this.soundService.arm();
                }
            });
        }
    }

    /**
     * The pairing window is moved to the page's body: the big screen's page is drawn with CSS zoom to
     * fit the TV (fit-screen.directive.ts), and a fixed window inside a zoomed page is placed and cut
     * wrongly. Angular keeps its bindings on a moved element.
     */
    ngAfterViewInit() {
        const el = this.remoteModal && this.remoteModal.nativeElement;
        if (el && typeof document !== 'undefined' && document.body) {
            document.body.appendChild(el);
        }
    }

    get muted() {
        return this.soundService.muted;
    }

    get soundLabel() {
        return this.muted ? this.t.soundOff : this.t.soundOn;
    }

    toggleSound() {
        const muted = !this.soundService.muted;
        this.soundService.setMuted(muted);
        // Counted, so we learn how many players silence the game. Never waits, never fails.
        this.apiService.logShare('sound', muted ? 'mute' : 'unmute', { locale: this.t.lang });
    }

    get pinUpper() {
        return String(this.pin || '').toUpperCase();
    }

    /** "ROUND 2" before a round, "3 OF 7" during a question. */
    get text(): string {
        if (this.questionOf) {
            return this.t.questionOf(this.questionOf[0], this.questionOf[1]);
        }
        return this.round !== null ? this.t.round(this.round) : undefined;
    }

    /** The big screen's host has no seat: their controls go to their phone, off the screen. */
    get remoteButton() {
        return this.host && this.presenter && !this.gameOver;
    }

    get pairLink() {
        return this.pairing && this.pairing.open ? remoteLink('https://bullshit.wtf', this.pin, this.pairing.code) : null;
    }

    get pairLinkShown() {
        const link = this.pairLink;
        return link ? link.replace(/^https:\/\//, '') : null;
    }

    /**
     * The press that opens the window: if a phone is already paired, it says so first; otherwise a new
     * one-time code is opened now (the code is never on the screen before this press).
     */
    openRemote() {
        this.showRemote = true;
        this.pairError = null;
        this.pairDigits = '';
        this.pairing = null;
        this.pairBusy = true;
        this.apiService.pairState(this.pin).then(view => {
            this.pairBusy = false;
            if (view.paired) {
                this.pairing = view;
            } else {
                this.newCode();
            }
        }, err => this.pairFailed(err));
    }

    newCode() {
        this.pairError = null;
        this.pairDigits = '';
        this.pairBusy = true;
        this.apiService.pairOpen(this.pin).then(view => {
            this.pairBusy = false;
            this.pairing = view;
            this.watchPairing();
        }, err => this.pairFailed(err));
    }

    /** While the code is open: how many phones asked, and when it runs out. */
    private watchPairing() {
        this.stopPairPoll();
        this.pairPoll = setInterval(() => {
            if (!this.showRemote) {
                return this.stopPairPoll();
            }
            this.apiService.pairState(this.pin).then(view => {
                if (!this.pairing || !this.pairing.open) {
                    return;
                }
                if (!view.open && !view.paired) {
                    this.pairError = this.h.remoteExpired;
                }
                this.pairing = view;
                if (!view.open) {
                    this.stopPairPoll();
                }
            }, () => { /* try again on the next beat */ });
        }, 3000);
    }

    private stopPairPoll() {
        if (this.pairPoll) {
            clearInterval(this.pairPoll);
            this.pairPoll = null;
        }
    }

    pairPhone() {
        const digits = String(this.pairDigits || '').replace(/\D/g, '');
        if (this.pairBusy || digits.length !== 4) {
            return;
        }
        this.pairBusy = true;
        this.pairError = null;
        this.apiService.pairPhone(this.pin, digits).then(() => {
            this.pairBusy = false;
            this.pairDigits = '';
            this.stopPairPoll();
            this.pairing = { open: false, code: null, exp: null, asked: 0, paired: true };
        }, err => this.pairFailed(err));
    }

    unpairPhone() {
        if (this.pairBusy) {
            return;
        }
        this.pairBusy = true;
        this.apiService.unpairPhone(this.pin).then(() => {
            this.pairBusy = false;
            this.pairing = { open: false, code: null, exp: null, asked: 0, paired: false };
            this.newCode();
        }, err => this.pairFailed(err));
    }

    closeRemote() {
        this.showRemote = false;
        this.pairDigits = '';
        this.stopPairPoll();
    }

    private pairFailed(err: any) {
        this.pairBusy = false;
        this.pairDigits = '';
        const code = err && err.code;
        if (code === 'WRONG_NUMBER') {
            this.pairError = this.h.remoteWrong;
            return;
        }
        if (code === 'NO_OFFER') {
            this.pairError = this.h.remoteExpired;
            this.pairing = Object.assign({}, this.pairing || { asked: 0, paired: false }, { open: false, code: null, exp: null });
            this.stopPairPoll();
            return;
        }
        if (code === 'NO_PAIRING') {
            this.pairError = this.h.remoteCantPair;
            return;
        }
        this.pairError = this.t.oops;
    }

    ngOnDestroy() {
        this.stopPairPoll();
        const el = this.remoteModal && this.remoteModal.nativeElement;
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
        this.gameSubscription.unsubscribe();
        if (this.playersSubscription) {
            this.playersSubscription.unsubscribe();
        }
    }

    private myPid(): string {
        const user = this.sessionService.user;
        return !this.presenter && user && user.pid ? user.pid : null;
    }

    private onPlayers(players: GamePlayers) {
        const me = this.myPid();
        this.seats = hostSeatRows(players, me);
        if (seatRemoved(this.hadSeat, players, me, this.gameOver)) {
            this.removed = true;
            this.showPlayers = false;
            this.gameService.unregister();
        }
        this.hadSeat = this.hadSeat || !!(me && players && players[me]);
    }

    openPlayers() {
        this.removing = null;
        this.removeError = false;
        this.showPlayers = true;
    }

    askRemove(seat: HostSeatRow) {
        this.removeError = false;
        this.removing = seat;
    }

    confirmRemove() {
        const seat = this.removing;
        if (!seat || this.removeBusy) {
            return;
        }
        this.removeBusy = true;
        this.apiService.removePlayer(this.pin, seat.pid).then(() => {
            this.removeBusy = false;
            this.removing = null;
        }, () => {
            this.removeBusy = false;
            this.removeError = true;
        });
    }

    onStateChange(state: GameState) {
        switch (state) {
            case GameState.GameStaging:
                this.registration = true;
                break;

            case GameState.RoundIntro:
                this.getCurrentRoundIndex();
                break;

            case GameState.ShowQuestion:
                this.getCurrentQuestionIndex();
                break;

            case GameState.ShowAnswers:
                this.getCurrentQuestionIndex();
                break;

            case GameState.RevealTheTruth:
                this.getCurrentQuestionIndex();
                break;

            case GameState.ScoreBoardFinal:
                this.gameOver = true;
                break;
        }

        this.stateSeen = true;
        this.loading = !this.localeSeen;
    }

    getCurrentQuestionIndex() {
        const qidxPromise = this.apiService.getQuestionIndex(this.pin);
        const totalQPromise = this.apiService.getTotalQuestions(this.pin);

        Promise
            .all([qidxPromise, totalQPromise])
            .then(([qidx, totalQ]) => this.questionOf = [qidx + 1, totalQ]);
    }

    getCurrentRoundIndex() {
        this.apiService.getRoundIndex(this.pin).then(ridx => {
            this.round = ridx + 1;
            this.questionOf = null;
        });
    }

    homeModal() {
        if (this.gameOver) {
            this.navigateHome();
        } else {
            this.showGoHomeModal = true;
        }
    }

    navigateHome() {
        this.gameService.unregister();
        this.router.navigate(['/']);
    }
}
