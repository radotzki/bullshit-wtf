import * as Raven from 'raven-js';
import { Game, Question } from './../../models';
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
    pin: string;
    gameTimer;
    question: Question;
    presenter: boolean;
    loading: boolean;
    errorMsg: string;
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
        this.apiService.getQuestion(this.pin).then(q => this.question = q);
        this.gameService.register(this.pin);
        this.presenter = !!this.sessionService.presenter;
        this.apiService.getTimestamp(this.pin).then(timestamp => {
            console.log('timestamp', timestamp);
        });

        if (!this.presenter) {
            this.checkQuestionSubmitted(this.pin, this.sessionService.user.name);
        }
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
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

    checkQuestionSubmitted(pin: string, nickname: string) {
        this.apiService.getAnswers(pin)
            .then(answers => answers.find(answer => answer.creators.includes(nickname)))
            .then(questionSubmitted => this.questionSubmitted = questionSubmitted);
    }

}
