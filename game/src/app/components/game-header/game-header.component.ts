import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';
import { GameState } from './../../game-model';
import { SoundService } from './../../services/sound.service';
import { gameStrings, GameStrings } from './../../pages/game-strings';
import { hostStrings, HostStrings, HostSeatRow, hostSeatRows, seatRemoved } from './../../pages/host-strings';
import { GamePlayers } from './../../game-model';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-game-header',
    templateUrl: './game-header.component.html',
    styleUrls: ['./game-header.component.scss']
})
export class GameHeaderComponent implements OnInit, OnDestroy {
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

    ngOnDestroy() {
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
