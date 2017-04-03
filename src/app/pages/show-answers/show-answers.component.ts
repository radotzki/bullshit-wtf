import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs/Subscription';
import { Component, OnInit, OnDestroy } from '@angular/core';

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
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
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

    // getDisplayAnswers(question: Question, numOfPlayers: number) {
        // const answersCount = this.presenter ? numOfPlayers + 1 : numOfPlayers;
        // const houseAnswers = question.fakeAnswers.filter(this.isHouseAnswer.bind(this));
        // let displayAnswers = question.fakeAnswers.filter(answer => {
        //     const myAnswer = !this.sessionService.presenter && answer.createdBy.indexOf(this.sessionService.user.name) > -1;
        //     const houseAnswer = this.isHouseAnswer(answer);
        //     return !myAnswer && !houseAnswer;
        // });
        // const missingAnswersCount = answersCount - 1 - displayAnswers.length;
        // const houseAnswersToAdd = houseAnswers.splice(0, missingAnswersCount);

        // displayAnswers = [...displayAnswers, ...houseAnswersToAdd];
        // displayAnswers.push(question.realAnswer);

        // displayAnswers = [...displayAnswers].sort((a, b) => a.text < b.text ? -1 : 1);
        // return displayAnswers;
    // }

}
