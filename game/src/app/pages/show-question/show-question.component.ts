import * as Raven from 'raven-js';
import { Subscription } from 'rxjs/Subscription';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { GameService, durations } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { GameState } from '../../game-model';

@Component({
    selector: 'app-show-question',
    templateUrl: './show-question.component.html',
    styleUrls: ['./show-question.component.scss']
})
export class ShowQuestionComponent implements OnInit, OnDestroy {
    pin: string;
    question: string;
    presenter: boolean;
    loading: boolean;
    errorMsg: string;
    answer: string;
    questionSubmitted: boolean;
    enteredCorrectAnswer: boolean;
    rtl: boolean;
    duration: number;
    past: number;
    timer;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.apiService.getQuestion(this.pin).then(q => this.question = q);
        this.apiService.getGameLocale(this.pin).then(locale => this.rtl = locale === 'he');
        this.gameService.register(this.pin);
        this.presenter = !!this.sessionService.presenter;
        this.startTimer();

        if (!this.presenter) {
            this.apiService.didAnswerSubmitted(this.pin).then(submitted => this.questionSubmitted = submitted);
        }
    }

    ngOnDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.answer(this.pin, this.answer.trim())
            .then(() => {
                this.questionSubmitted = true;
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;

                if (err && err.code === 'CORRECT_ANSWER') {
                    this.enteredCorrectAnswer = true;
                } else {
                    Raven.captureException(new Error(JSON.stringify(err)));
                    this.errorMsg = 'oops, something went wrong. Please try again';
                }
            });
    }

    startTimer() {
        this.apiService.getGameTimestamp(this.pin).then(({ timestamp, now }) => {
            this.duration = durations[GameState.ShowQuestion];
            this.past = now - timestamp;
            this.timer = setInterval(() => this.past += 1000, 1000);
        });
    }

}