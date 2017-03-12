import * as Raven from 'raven-js';
import { Game, Question, QuestionState } from './../../models';
import { Subscription } from 'rxjs/Subscription';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-show-question',
    templateUrl: './show-question.component.html',
    styleUrls: ['./show-question.component.scss']
})
export class ShowQuestionComponent implements OnInit, OnDestroy {
    gameSubscription: Subscription;
    pin: string;
    presenter: boolean;
    loading: boolean;
    errorMsg: string;
    game: Game;
    elapsedTime: number;
    elapsedTimeInterval;
    answer: string;
    questionSubmitted: boolean;
    enteredCorrectAnswer: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.gameSubscription = this.gameService.feed(this.pin).subscribe(this.onGameChanged.bind(this));
        this.gameService.register(this.pin);
        this.presenter = !!this.sessionService.presenter;
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
        this.gameSubscription.unsubscribe();

        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
        }
    }

    onGameChanged(resp: Game) {
        this.game = resp;

        if (!this.elapsedTime) {
            this.initElapsedTime();
        }

        this.questionSubmitted = !this.presenter && this.checkQuestionSubmitted(this.game, this.sessionService.user.name);
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

    checkQuestionSubmitted(game: Game, username: string) {
        return game.currentQuestion.fakeAnswers.some(fakeAnswer => fakeAnswer.createdBy.indexOf(username) > -1);
    }

    tick() {
        this.apiService.tick(this.pin, QuestionState.ShowQuestion);
    }

    initElapsedTime() {
        this.elapsedTime = this.calcElapsedTime(this.game);
        this.elapsedTimeInterval = setInterval(() => {
            if (this.elapsedTime >= this.game.answerQuestionTime) {
                this.tick();
            } else {
                this.elapsedTime += 1;
            }
        }, 1000);
    }

    calcElapsedTime(game: Game) {
        const currentTime = game.currentTime;
        const startedAt = game.currentQuestion.startedAt;
        return Math.round(this.timeDiff(currentTime, startedAt) / 1000);
    }

    timeDiff(from, to): number {
        const toTime = new Date(to);
        const fromTime = new Date(from);
        return Math.abs(fromTime.getTime() - toTime.getTime());
    }

}
