import { GameScheme, GamePlayers, Answers, GameState, AnswerSelections } from './../game-model';
import { SessionService } from './session.service';
import { Observable } from 'rxjs/Observable';
import { Http } from '@angular/http';
import { Injectable, NgZone } from '@angular/core';
import { environment } from '../../environments/environment';
import { initializeApp } from 'firebase';
import { Subscriber } from 'rxjs/Subscriber';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import 'rxjs/add/operator/publish';

const firebase = initializeApp(environment.firebaseConfig);

@Injectable()
export class ApiService {
    gamesRef: firebase.database.Reference;
    timeDiff: Promise<number>;

    constructor(
        private http: Http,
        private sessionService: SessionService,
        private zone: NgZone,
    ) {
        this.gamesRef = firebase.database().ref('games');
    }

    gameHasPresenter(pin: string) {
        pin = pin.toUpperCase();
        return this.get<boolean>(this.gamesRef.child(pin).child('presenter'));
    }

    createGame(locale: string, count: number): Promise<{ pin: string }> {
        return this.post(`newGame`, { locale, count });
    }

    async join(pin: string, nickname: string) {
        // TODO: 8 players max
        pin = pin.toUpperCase();
        const pid = this.gamesRef.child(pin).child('players').push().key;
        await this.gamesRef.child(pin).child('players').child(pid).set({ nickname, score: 0 });
        return pid;
    }

    joinAsPresenter(pin: string) {
        pin = pin.toUpperCase();
        return this.gamesRef.child(pin).child('presenter').set(true);
    }

    getPlayers(pin: string) {
        pin = pin.toUpperCase();
        return this.get<GamePlayers>(this.gamesRef.child(pin).child('players'));
    }

    getPlayersObservable(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<GamePlayers>(this.gamesRef.child(pin).child('players'));
    }

    game(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<GameScheme>(this.gamesRef.child(pin));
    }

    gameState(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<number>(this.gamesRef.child(pin).child('state').child('id'));
    }

    getRoundIndex(pin: string) {
        pin = pin.toUpperCase();
        return this.get<number>(this.gamesRef.child(pin).child('roundIndex'));
    }

    getGameTimestamp(pin: string) {
        pin = pin.toUpperCase();

        if (!this.timeDiff) {
            this.timeDiff = this.post<{ now: number }>('time').then(({ now }) => Date.now() - now);
        }

        return Promise.all([
            this.get<number>(this.gamesRef.child(pin).child('state').child('timestamp')),
            this.timeDiff.then(diff => Date.now() - diff)
        ]).then(resp => ({ timestamp: resp[0], now: resp[1] }));
    }

    getQuestion(pin: string) {
        pin = pin.toUpperCase();
        return this.get<string>(this.gamesRef.child(pin).child('currentQ'));
    }

    getGameLocale(pin: string) {
        pin = pin.toUpperCase();
        return this.get<string>(this.gamesRef.child(pin).child('locale'));
    }

    async didAnswerSubmitted(pin: string) {
        pin = pin.toUpperCase();
        const pid = this.sessionService.user.pid;
        const userAnswer = await this.get<{}>(this.gamesRef.child(pin).child('answers').child(pid));
        return !!userAnswer;
    }

    answer(pin: string, answer: string) {
        pin = pin.toUpperCase();
        const pid = this.sessionService.user.pid;
        return this.post('answer', { pin, answer, pid });
    }

    async getAnswers(pin: string) {
        pin = pin.toUpperCase();
        const allAnswers = await this.get<Answers>(this.gamesRef.child(pin).child('answers'));
        let answersArray = Object.keys(allAnswers).map(k => allAnswers[k]);

        if (!this.sessionService.presenter) {
            const pid = this.sessionService.user.pid;
            const playerAnswer = allAnswers[pid];

            if (playerAnswer) {
                answersArray = answersArray.filter(a => a.text !== playerAnswer.text);
            }
        }

        return answersArray.map(a => a.text);
    }

    async didAnswerSelected(pin: string) {
        pin = pin.toUpperCase();
        const pid = this.sessionService.user.pid;
        const userAnswer = await this.get<{}>(this.gamesRef.child(pin).child('answerSelections').child(pid));
        return !!userAnswer;
    }

    chooseAnswer(pin: string, answer: string) {
        pin = pin.toUpperCase();
        const pid = this.sessionService.user.pid;
        return this.gamesRef.child(pin).child('answerSelections').child(pid).set({ text: answer.toLowerCase() });
    }

    tick(pin: string, gameState: GameState) {
        pin = pin.toUpperCase();

        return this.gameHasPresenter(pin).then(hasPresenter => {
            if (!hasPresenter || (hasPresenter && this.sessionService.presenter)) {
                return this.gamesRef.child(pin).child('tick').set(gameState);
            }
        });
    }

    async getAggregatedAnswers(pin: string) {
        pin = pin.toUpperCase();
        const players = await this.get<GamePlayers>(this.gamesRef.child(pin).child('players'));
        const answers = await this.get<Answers>(this.gamesRef.child(pin).child('answers'));
        const answerSelections = await this.get<AnswerSelections>(this.gamesRef.child(pin).child('answerSelections'));
        return { players, answers, answerSelections };
    }

    private post<T>(url: string, body: Object = {}): Promise<T> {
        return this.http.post(environment.cloudfunctions + url, body)
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

    private get<T>(ref): Promise<T> {
        return ref.once('value').then(s => s.val());
    }

}
