import { GameScheme, GamePlayers, Answers, GameState } from './../game-model';
import { SessionService } from './session.service';
import { Observable } from 'rxjs/Observable';
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

    async join(pin: string, nickname: string) {
        // TODO: 8 players max
        const pid = this.gamesRef.child(pin).child('players').push().key;
        await this.gamesRef.child(pin).child('players').child(pid).set({ nickname, score: 0 });
        return pid;
    }

    getPlayers(pin: string) {
        return this.observe<GamePlayers>(this.gamesRef.child(pin).child('players'));
    }

    startGame(pin: string) {
        return this.tick(pin, GameState.RoundIntro);
    }

    game(pin: string) {
        return this.observe<GameScheme>(this.gamesRef.child(pin));
    }

    getGameTimestamp(pin: string) {
        return Promise.all([
            this.getOnce<number>(this.gamesRef.child(pin).child('state').child('timestamp')),
            this.post<{ now: number }>('time')
        ]).then(resp => ({ timestamp: resp[0], now: resp[1].now }));
    }

    tickRoundIntro(pin: string) {
        return this.tick(pin, GameState.ShowQuestion);
    }

    getQuestion(pin: string) {
        return this.getOnce<string>(this.gamesRef.child(pin).child('currentQ'));
        // return this.getCurrentQ(pin)
        //     .then(currentQ => this.getObjectOnce(`game-questions/${pin}/${currentQ}`))
        //     .then(s => s.val())
        //     .then(q => new Question(q.citation, q.text, q.locale));
    }

    getGameLocale(pin: string) {
        return this.getOnce<string>(this.gamesRef.child(pin).child('locale'));
    }

    async didAnswerSubmitted(pin: string) {
        const pid = this.sessionService.user.pid;
        const userAnswer = await this.getOnce<{}>(this.gamesRef.child(pin).child('answers').child(pid));
        return !!userAnswer;
    }

    answer(pin: string, answer: string) {
        const pid = this.sessionService.user.pid;
        return this.post('answer', { pin, answer, pid });
    }

    async getAnswers(pin: string) {
        const pid = this.sessionService.user.pid;
        const allAnswers = await this.getOnce<Answers>(this.gamesRef.child(pin).child('answers'));
        console.log('allAnswers', allAnswers);
        const playerAnswer = allAnswers[pid].text;
        const answersArray = Object.keys(allAnswers).map(k => allAnswers[k]);
        const otherAnswers = answersArray.filter(a => a.text !== playerAnswer);
        return otherAnswers.map(a => a.text);
    }

    async didAnswerSelected(pin: string) {
        const pid = this.sessionService.user.pid;
        const userAnswer = await this.getOnce<{}>(this.gamesRef.child(pin).child('answerSelections').child(pid));
        return !!userAnswer;
    }

    chooseAnswer(pin: string, answer: string) {
        return Promise.resolve();
        // return this.unauthPost(`api/games/${pin}/chooseAnswer`, { answer });
    }

    replay(pin: string) {
        return Promise.resolve();
        // return this.unauthPost(`api/games/${pin}/createChild`, {});
    }

    private tick(pin: string, gameSate: GameState) {
        return this.gamesRef.child(pin).child('gameTick').set(gameSate);
    }

    private post<T>(url: string, body: Object = {}): Promise<T> {
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

    private getOnce<T>(ref): Promise<T> {
        return ref.once('value').then(s => s.val());
    }

}
