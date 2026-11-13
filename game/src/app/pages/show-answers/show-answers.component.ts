import { reportError } from './../../sentry/sentry.module';
import { Howl } from 'howler';
import { fadeOutAndUnload } from './../fade-out';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { GameService, durations } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { GameState } from '../../game-model';
import { SoundService } from './../../services/sound.service';
import { gameStrings, GameStrings } from './../game-strings';
import { aboutStrings, AboutStrings } from './../about-strings';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-show-answers',
    templateUrl: './show-answers.component.html',
    styleUrls: ['./show-answers.component.scss']
})
export class ShowAnswersComponent implements OnInit, OnDestroy {
    pin: string;
    presenter: boolean;
    loading: boolean;
    errorMsg: string;
    question: string;
    rtl: boolean;
    t: GameStrings = gameStrings('en');
    answerSelected: boolean;
    answers: string[];
    showQuestion: boolean;
    /** A taste (a game started alone) has no writing screen: its question is first read here, above the answers. */
    taste = false;
    /** An About question about this phone's player: they know the truth, so they watch and do not pick. */
    aboutMe = false;
    aboutWords: AboutStrings = aboutStrings('en');
    duration: number;
    past: number;
    timer;
    sound: Howl;
    private phoneTickStopped = false;
    panic: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
        private soundService: SoundService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.gameService.register(this.pin);
        this.presenter = !!this.sessionService.presenter;
        this.apiService.getQuestion(this.pin).then(q => this.question = q);
        this.useLocale(this.apiService.knownGameLocale(this.pin));
        this.apiService.getGameLocale(this.pin).then(locale => this.useLocale(locale), () => null);
        this.apiService.didAnswerSelected(this.pin).then(selected => this.answerSelected = selected);
        this.apiService.getAnswers(this.pin).then(a => this.answers = a);
        this.apiService.getTaste(this.pin).then(taste => this.taste = !!taste);
        this.apiService.getAbout(this.pin).then(about => {
            const user = this.sessionService.user;
            this.aboutMe = !!about && !this.presenter && !!user && user.pid === about.pid;
        });
        this.startTimer();
        this.playBackground();
    }

    private useLocale(locale: string) {
        this.rtl = locale === 'he';
        this.t = gameStrings(locale);
        this.aboutWords = aboutStrings(locale);
    }

    ngOnDestroy() {
        this.stopMusic();
        this.phoneTickStopped = true;
        this.soundService.stop('time-warning');
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    submit(answer: string) {
        if (this.aboutMe) {
            return;
        }
        this.loading = true;
        this.errorMsg = '';

        this.apiService.chooseAnswer(this.pin, answer, this.gameService.currentStep())
            .then(() => {
                this.answerSelected = true;
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;
                reportError(err, 'chooseAnswer', { pin: this.pin });
                this.errorMsg = this.t.oops;
            });
    }

    startTimer() {
        this.apiService.getGameTimestamp(this.pin).then(({ timestamp, now }) => {
            this.duration = durations[GameState.ShowAnswers];
            this.past = now - timestamp;
            this.timer = setInterval(() => {
                this.past += 1000;

                if (!this.panic && this.duration - this.past < 5000) {
                    this.playTimeWarning();
                    this.panic = true;
                }
            }, 1000);
        });
    }

    playBackground() {
        this.playMusic(['/assets/sounds/during-game.mp3']);
    }

    playTimeWarning() {
        this.playMusic(['/assets/sounds/time-warning.mp3']);

        // Phones tick too in a staged-reveal game with no big screen (unless muted).
        if (!this.presenter) {
            this.apiService.phoneSound(this.pin).then(sound => {
                if (sound && !this.phoneTickStopped) {
                    this.soundService.play('time-warning');
                }
            });
        }
    }

    playMusic(src: string[]) {
        if (this.presenter) {
            this.stopMusic();
            this.sound = new Howl({ src, autoplay: true });
        }
    }

    stopMusic() {
        if (this.sound) {
            fadeOutAndUnload(this.sound);
        }
    }

}
