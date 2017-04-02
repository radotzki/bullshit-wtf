import { GameScheme, GamePlayers } from './../../../game-model';
import { SessionService } from './session.service';
import { Observable } from 'rxjs/Observable';
import { Game, GameState, Question, Answer } from './../models';
import { Http } from '@angular/http';
import { Injectable, NgZone } from '@angular/core';
import { environment } from '../../environments/environment';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import 'rxjs/add/operator/publish';
import { initializeApp } from 'firebase';
import { Subscriber } from 'rxjs/Subscriber';

const app = initializeApp({
    apiKey: 'AIzaSyB9DBGta81H3qp3BMukjNF-pHKbh2RPcvA',
    authDomain: 'bullshit-fae48.firebaseapp.com',
    databaseURL: 'https://bullshit-fae48.firebaseio.com',
    storageBucket: 'bullshit-fae48.appspot.com',
    messagingSenderId: '328908700392',
});

@Injectable()
export class ApiService {
    gamesRef: firebase.database.Reference;

    constructor(
        private http: Http,
        private sessionService: SessionService,
        private zone: NgZone,
    ) {
        this.gamesRef = app.database().ref('games');
    }

    createGame(lang: string, count: number): Promise<{ pin: string }> {
        return this.post(`newGame`, { lang, count });
    }

    join(pin: string, nickname: string) {
        // TODO: 8 players max
        return this.gamesRef.child(pin).child('players').push({ nickname, score: 0 });
    }

    getPlayers(pin: string) {
        return this.observe<GamePlayers>(this.gamesRef.child(pin).child('players'));
    }

    startGame(pin: string) {
        return this.gamesRef.child(pin).child('gameTick').set(GameState.RoundIntro);
    }

    game(pin: string) {
        return this.observe<GameScheme>(this.gamesRef.child(pin));
    }

    getQuestion(pin: string): firebase.Promise<Question> {

        return null;
        // return this.getCurrentQ(pin)
        //     .then(currentQ => this.getObjectOnce(`game-questions/${pin}/${currentQ}`))
        //     .then(s => s.val())
        //     .then(q => new Question(q.citation, q.text, q.locale));
    }

    answer(pin: string, answer: string) {
        const nickname = this.sessionService.user.name;
        return this.post('answer', { pin, answer, nickname });
    }

    getAnswers(pin: string): firebase.Promise<Answer[]> {
        return null;
        // return this.getCurrentQ(pin)
        //     .then(currentQ => this.getObjectOnce(`game-question-answers/${pin}/${currentQ}`))
        //     .then(resp => resp.val())
        //     .then(resp => Object.keys(resp || {}).map(id => new Answer(id, resp[id])));
    }

    chooseAnswer(pin: string, answer: string) {
        return Promise.resolve();
        // return this.unauthPost(`api/games/${pin}/chooseAnswer`, { answer });
    }

    replay(pin: string) {
        return Promise.resolve();
        // return this.unauthPost(`api/games/${pin}/createChild`, {});
    }

    private post(url: string, body: Object) {
        return this.http.post('https://us-central1-bullshit-fae48.cloudfunctions.net/' + url, body)
            .toPromise()
            .then(resp => resp.json(), resp => Promise.reject(resp.json()));
    }

    private observe<T>(query: firebase.database.Query, eventType = 'value') {
        return new Observable<T>((observer: Subscriber<T>) => {
            const listener = query.on(eventType, snap => {
                this.zone.run(() => {
                    observer.next(snap.val() as T);
                });
            }, err => observer.error(err));

            return () => query.off(eventType, listener);
        }).publish().refCount();
    }

}
