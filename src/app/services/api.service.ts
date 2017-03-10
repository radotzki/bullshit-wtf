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

    signin(email: string, redirect: string) {
        return this.unauthPost(`get-token`, { email, redirect });
    }

    register(email: string, name: string) {
        return this.unauthPost(`register`, { email, name });
    }

    validateToken(email: string, token: string): Promise<{ token: string, id: string, name: string }> {
        return this.unauthPost(`validate-token`, { email, token });
    }

    join(gamePin: string) {
        return this.post(`api/games/${gamePin}/join`, {});
    }

    presenterSignin(): Promise<{ token: string }> {
        return this.unauthPost(`get-token`, { presenter: true });
    }

    createGame(categories: string[], numberOfQuestions: number, answerQuestionTime = 45, selectAnswerTime = 45): Promise<{ name: string }> {
        return this.post(`api/games/`, { categories, numberOfQuestions, answerQuestionTime, selectAnswerTime });
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
        return this.post(`api/games/${pin}/tick/${currentState}`, { });
    }

    answer(pin: string, answer: string) {
        return this.post(`api/games/${pin}/answer`, { answer });
    }

    chooseAnswer(pin: string, answer: string) {
        return this.post(`api/games/${pin}/chooseAnswer`, { answer });
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
