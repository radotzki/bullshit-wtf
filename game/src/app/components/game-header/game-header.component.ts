import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs/Subscription';
import { GameState } from './../../game-model';
import { SoundService } from './../../services/sound.service';
import { revealStringsFor } from './../../pages/reveal-the-truth/reveal-strings';

@Component({
    selector: 'app-game-header',
    templateUrl: './game-header.component.html',
    styleUrls: ['./game-header.component.scss']
})
export class GameHeaderComponent implements OnInit, OnDestroy {
    pin: string;
    text: string;
    gameOver: boolean;
    registration: boolean;
    gameSubscription: Subscription;
    loading: boolean;
    presenter: boolean;
    showGoHomeModal: boolean;
    /** A phone that plays the game's sounds (a staged-reveal game with no big screen) gets a mute button. */
    soundButton = false;
    private locale = 'en';
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
        this.gameSubscription = this.apiService.gameState(this.pin).subscribe(this.onStateChange.bind(this));

        if (!this.presenter && this.pin) {
            this.apiService.phoneSound(this.pin).then(sound => {
                this.soundButton = sound;
                if (sound) {
                    // Download the sounds now; the phone lets them play after the player's next tap.
                    this.soundService.arm();
                    this.apiService.getGameLocale(this.pin).then(locale => this.locale = locale, () => undefined);
                }
            });
        }
    }

    get muted() {
        return this.soundService.muted;
    }

    get soundLabel() {
        const s = revealStringsFor(this.locale);
        return this.muted ? s.soundOff : s.soundOn;
    }

    toggleSound() {
        const muted = !this.soundService.muted;
        this.soundService.setMuted(muted);
        // Counted, so we learn how many players silence the game. Never waits, never fails.
        this.apiService.logShare('sound', muted ? 'mute' : 'unmute', { locale: this.locale });
    }

    ngOnDestroy() {
        this.gameSubscription.unsubscribe();
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

        this.loading = false;
    }

    getCurrentQuestionIndex() {
        const qidxPromise = this.apiService.getQuestionIndex(this.pin);
        const totalQPromise = this.apiService.getTotalQuestions(this.pin);

        Promise
            .all([qidxPromise, totalQPromise])
            .then(([qidx, totalQ]) => this.text = `${qidx + 1} OF ${totalQ}`);
    }

    getCurrentRoundIndex() {
        this.apiService.getRoundIndex(this.pin).then(ridx => this.text = `ROUND ${ridx + 1}`);
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
