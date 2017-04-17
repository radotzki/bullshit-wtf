import * as Raven from 'raven-js';
import { Howl } from 'howler';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { GameService, durations } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs/Subscription';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { GameState } from '../../game-model';

@Component({
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
    answerSelected: boolean;
    answers: string[];
    showQuestion: boolean;
    duration: number;
    past: number;
    timer;
    sound: Howl;
    panic: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.gameService.register(this.pin);
        this.presenter = !!this.sessionService.presenter;
        this.apiService.getQuestion(this.pin).then(q => this.question = q);
        this.apiService.getGameLocale(this.pin).then(locale => this.rtl = locale === 'he');
        this.apiService.didAnswerSelected(this.pin).then(selected => this.answerSelected = selected);
        this.apiService.getAnswers(this.pin).then(a => this.answers = a);
        this.startTimer();
        this.playBackground();
    }

    ngOnDestroy() {
        this.stopMusic();
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    submit(answer: string) {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.chooseAnswer(this.pin, answer)
            .then(() => {
                this.answerSelected = true;
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;
                Raven.captureException(new Error(JSON.stringify(err)));
                this.errorMsg = 'oops, something went wrong. Please try again';
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
        this.playMusic(['/assets/sounds/show-answers.mp3']);
    }

    playTimeWarning() {
        this.playMusic(['/assets/sounds/time-warning.mp3']);
    }

    playMusic(src: string[]) {
        if (this.presenter) {
            this.stopMusic();
            this.sound = new Howl({ src, autoplay: true });
        }
    }

    stopMusic() {
        if (this.sound) {
            this.sound.fade(1, 0, 1000);
            setTimeout(this.sound.stop, 1000);
        }
    }

}
