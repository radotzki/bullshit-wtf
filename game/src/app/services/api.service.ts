import { reportError } from './../sentry/sentry.module';
import { GameScheme, GamePlayers, Answers, GameState, GameStateInfo, AnswerSelections, RevealAnswer } from './../game-model';
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

/**
 * Build a real Error from a failed call to a cloud function, keeping the
 * server's message and code when it sent JSON, and the HTTP status always.
 */
function apiError(url: string, resp: any) {
    let body: any = null;

    try {
        body = resp.json();
    } catch (e) {
        body = null;
    }

    const status = resp && resp.status;
    const message = (body && body.message) ||
        (status === 0 ? `Network error calling ${url}` : `Calling ${url} failed with status ${status}`);
    const error: any = new Error(message);
    error.code = (body && body.code) || (status === 0 ? 'NETWORK_ERROR' : 'HTTP_' + status);
    error.status = status;
    error.endpoint = url;
    return error;
}

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

    /** Anonymous uid of the browser that created (or replayed) this game, if known. */
    getGameCreator(pin: string) {
        pin = pin.toUpperCase();
        return this.get<string>(this.gamesRef.child(pin).child('creator'));
    }

    async createGame(locale: string, count: number): Promise<{ pin: string }> {
        // The creating browser's anonymous uid marks the host, so BigQuery can
        // tell whether hosts come back. Creating still works if sign-in fails.
        const uid = await this.currentUid();
        return this.post<{ pin: string }>(`newGame`, { locale, count, uid });
    }

    /** This browser's anonymous uid, signing in if needed; undefined if that fails. */
    async currentUid(): Promise<string> {
        try {
            const auth = firebase.auth();
            const user = auth.currentUser || await auth.signInAnonymously();
            return user ? user.uid : undefined;
        } catch (error) {
            reportError(error, 'currentUid');
            return undefined;
        }
    }

    async join(pin: string, nickname: string, uid: string) {
        pin = pin.toUpperCase();
        return this.post<{ pid: string }>(`join`, { pin, nickname, uid }).then(resp => resp.pid);
    }

    validateGameName(pin: string) {
        pin = pin.toUpperCase();
        return this.post(`validateGameName`, { pin });
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

    gameState(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<number>(this.gamesRef.child(pin).child('state').child('id'));
    }

    getRoundIndex(pin: string) {
        pin = pin.toUpperCase();
        return this.get<number>(this.gamesRef.child(pin).child('roundIndex'));
    }

    getQuestionIndex(pin: string) {
        pin = pin.toUpperCase();
        return this.get<number>(this.gamesRef.child(pin).child('questionIndex'));
    }

    getTotalQuestions(pin: string) {
        pin = pin.toUpperCase();
        return this.get<number>(this.gamesRef.child(pin).child('totalQ'));
    }

    getGameTimestamp(pin: string) {
        pin = pin.toUpperCase();

        return Promise.all([
            this.get<number>(this.gamesRef.child(pin).child('state').child('timestamp')),
            this.serverNow(),
        ]).then(resp => ({ timestamp: resp[0], now: resp[1] }));
    }

    private serverNow() {
        if (!this.timeDiff) {
            this.timeDiff = this.post<{ now: number }>('time').then(({ now }) => Date.now() - now);
        }

        return this.timeDiff.then(diff => Date.now() - diff);
    }

    getGameStateInfo(pin: string) {
        pin = pin.toUpperCase();

        return Promise.all([
            this.get<GameStateInfo>(this.gamesRef.child(pin).child('state')),
            this.serverNow(),
        ]).then(resp => ({ state: resp[0], now: resp[1] }));
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
        let answersArray = Object.keys(allAnswers || {})
            .map(k => allAnswers[k].text)
            .filter((v, i, a) => a.indexOf(v) === i)
            .sort((a, b) => a > b ? 1 : -1);

        if (!this.sessionService.presenter) {
            const pid = this.sessionService.user.pid;
            const playerAnswer = allAnswers[pid];

            if (playerAnswer) {
                answersArray = answersArray.filter(a => a !== playerAnswer.text);
            }
        }

        return answersArray;
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

    /**
     * Ask the server to end the phase `state`. Any player may do this: the server only accepts it
     * once that phase's deadline has passed, and only once.
     */
    tickFrom(pin: string, state: GameStateInfo) {
        pin = pin.toUpperCase();
        return this.gamesRef.child(pin).child('tick').set(`${state.id}:${state.timestamp}`);
    }

    getRevealAnswers(pin: string) {
        pin = pin.toUpperCase();
        return this.get<RevealAnswer[]>(this.gamesRef.child(pin).child('revealAnswers'));
    }

    /** This player has seen the reveal and wants to move on. When every player has, the server ends the reveal. */
    revealDone(pin: string) {
        pin = pin.toUpperCase();
        const pid = this.sessionService.user.pid;
        return this.gamesRef.child(pin).child('revealDone').child(pid).set(true);
    }

    /** How many players have tapped NEXT on the reveal so far. */
    revealDoneCount(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<{ [pid: string]: boolean }>(this.gamesRef.child(pin).child('revealDone'))
            .map(done => Object.keys(done || {}).length);
    }

    playerScore(pin: string, pid: string) {
        pin = pin.toUpperCase();
        return this.observe<number>(this.gamesRef.child(pin).child('players').child(pid).child('score'));
    }

    async fork(pin: string) {
        pin = pin.toUpperCase();
        const uid = await this.currentUid();
        return this.post<{ pid: string }>(`fork`, { pin, uid });
    }

    getForkGame(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<string>(this.gamesRef.child(pin).child('fork'));
    }

    async signInAnonymously(pin: string, nickname: string, via?: string) {
        try {
            const user = await firebase.auth().signInAnonymously();
            this.post('onJoinGame', { uid: user.uid, pin, nickname, via });
            return user;
        } catch (error) {
            console.log(error);
            reportError(error, 'signInAnonymously', { pin });
        }
    }

    private post<T>(url: string, body: Object = {}): Promise<T> {
        return this.http.post(environment.cloudfunctions + url, body)
            .toPromise()
            .then(resp => resp.json(), resp => Promise.reject(apiError(url, resp)));
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
