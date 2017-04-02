import { SessionService } from './session.service';
import { Observable } from 'rxjs/Observable';
import { Game, GameState, Question, Answer } from './../models';
import { Http } from '@angular/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import { AngularFire } from 'angularfire2';
import { initializeApp } from 'firebase';

const app = initializeApp({
    apiKey: 'AIzaSyB9DBGta81H3qp3BMukjNF-pHKbh2RPcvA',
    authDomain: 'bullshit-fae48.firebaseapp.com',
    databaseURL: 'https://bullshit-fae48.firebaseio.com',
    storageBucket: 'bullshit-fae48.appspot.com',
    messagingSenderId: '328908700392',
});

// this.gamesRef = app.database().ref('games');

@Injectable()
export class ApiService {
    gamesRef: firebase.database.Reference;

    constructor(
        private http: Http,
        private af: AngularFire,
        private sessionService: SessionService,
    ) {
        // const app = initializeApp({
        //     apiKey: 'AIzaSyB9DBGta81H3qp3BMukjNF-pHKbh2RPcvA',
        //     authDomain: 'bullshit-fae48.firebaseapp.com',
        //     databaseURL: 'https://bullshit-fae48.firebaseio.com',
        //     storageBucket: 'bullshit-fae48.appspot.com',
        //     messagingSenderId: '328908700392',
        // });

        this.gamesRef = app.database().ref('games');
    }

    createGame(lang: string, count: number): Promise<{ pin: string }> {
        return this.cloudPost(`newGame`, { lang, count });
    }

    join(pin: string, nickname: string) {
        // TODO: 8 players max
        return this.gamesRef.child(pin).child('players').push({ nickname, score: 0 });
    }

    getPlayers(pin: string) {
        return this.af.database.list(`game-players/${pin}`)
            .map(resp => resp.map(item => Object.assign({}, { name: item.$key }, item)))
            .map(resp => resp.sort((a, b) => a.order > b.order ? 1 : -1));
    }

    game(pin: string): Observable<Game> {
        // TODO: online users, choose leader by nickname, only the leader will tick states
        // const userRef = this.af.database.object(`game-online-players/${pin}/${this.sessionService.user.name}`).$ref;
        // const amOnline = this.af.database.object('/.info/connected').$ref;
        // amOnline.on('value', function (snapshot) {
        //     if (snapshot.val()) {
        //         userRef.onDisconnect().remove();
        //         userRef.set(true);
        //     }
        // });

        return this.af.database.object(`games/${pin}`)
            .map(resp => Object.assign({}, { pin: resp.$key }, resp));
    }

    startGame(pin: string) {
        return this.af.database.object(`games/${pin}/state`).set(GameState.RoundIntro);
    }

    getQuestion(pin: string): firebase.Promise<Question> {
        return this.getCurrentQ(pin)
            .then(currentQ => this.getObjectOnce(`game-questions/${pin}/${currentQ}`))
            .then(s => s.val())
            .then(q => new Question(q.citation, q.text, q.locale));
    }

    answer(pin: string, answer: string) {
        const nickname = this.sessionService.user.name;
        return this.cloudPost('answer', { pin, answer, nickname });
    }

    getAnswers(pin: string): firebase.Promise<Answer[]> {
        return this.getCurrentQ(pin)
            .then(currentQ => this.getObjectOnce(`game-question-answers/${pin}/${currentQ}`))
            .then(resp => resp.val())
            .then(resp => Object.keys(resp || {}).map(id => new Answer(id, resp[id])));
    }

    chooseAnswer(pin: string, answer: string) {
        return Promise.resolve();
        // return this.unauthPost(`api/games/${pin}/chooseAnswer`, { answer });
    }

    replay(pin: string) {
        return Promise.resolve();
        // return this.unauthPost(`api/games/${pin}/createChild`, {});
    }

    private getCurrentQ(pin: string) {
        return this.getObjectOnce(`games/${pin}/currentQ`).then(s => s.val());
    }

    private cloudPost(url: string, body: Object) {
        return this.http.post('https://us-central1-bullshit-fae48.cloudfunctions.net/' + url, body)
            .toPromise()
            .then(resp => resp.json(), resp => Promise.reject(resp.json()));
    }

    private unauthPost(url: string, body: Object) {
        return this.http.post(environment.server + '/' + url, body)
            .toPromise()
            .then(resp => resp.json(), resp => Promise.reject(resp.json()));
    }

    private getListOnce(path: string) {
        return this.af.database.list(path).$ref.once('value');
    }

    private getObjectOnce(path: string) {
        return this.af.database.object(path).$ref.once('value');
    }

}
