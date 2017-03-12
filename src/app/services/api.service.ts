import { AuthHttp } from 'angular2-jwt';
import { Http } from '@angular/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import { QuestionState } from '../models';

@Injectable()
export class ApiService {

    constructor(
        private http: Http,
        private authHttp: AuthHttp,
    ) { }

    join(pin: string, nickname: string): Promise<{ pin: string, token: string }> {
        return this.unauthPost(`api/games-join`, { nickname, pin });
    }

    presenterSignin(): Promise<{ token: string }> {
        return this.unauthPost(`get-token`, { presenter: true });
    }

    createGame(categories: string[], numberOfQuestions: number, answerQuestionTime = 45, selectAnswerTime = 45): Promise<{ name: string }> {
        return this.unauthPost(`api/games-create`, { categories, numberOfQuestions, answerQuestionTime, selectAnswerTime });
    }

    getGame(pin: string) {
        return this.post(`api/games/${pin}`, {});
    }

    startGame(pin: string) {
        return this.post(`api/games/${pin}/start`, {});
    }

    tickRoundIntro(pin: string) {
        return this.post(`api/games/${pin}/tickRoundIntro`, {});
    }

    tick(pin: string, currentState: QuestionState) {
        return this.post(`api/games/${pin}/tick/${currentState}`, {});
    }

    answer(pin: string, answer: string) {
        return this.post(`api/games/${pin}/answer`, { answer });
    }

    chooseAnswer(pin: string, answer: string) {
        return this.post(`api/games/${pin}/chooseAnswer`, { answer });
    }

    replay(pin: string) {
        return this.post(`api/games/${pin}/createChild`, {});
    }

    private post(url: string, body: Object) {
        return this.authHttp.post(environment.server + '/' + url, body)
            .toPromise()
            .then(resp => resp.json(), resp => Promise.reject(resp.json()));
    }

    private unauthPost(url: string, body: Object) {
        return this.http.post(environment.server + '/' + url, body)
            .toPromise()
            .then(resp => resp.json(), resp => Promise.reject(resp.json()));
    }

}
