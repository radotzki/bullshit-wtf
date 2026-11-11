import { reportError } from './../sentry/sentry.module';
import {
    GameScheme, GamePlayers, Answers, GameState, GameStateInfo, AnswerSelections, RevealAnswer, Crew, Highlights,
} from './../game-model';
import { SessionService } from './session.service';
import { answersList } from './answers-list';
import { newHostKey, rememberHostKey, hostKeyFor } from './host-key';
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

/** The longest a tap on Create, Join, Replay or Rematch waits for sign-in. */
export const SIGN_IN_WAIT_MS = 1500;

/** The one anonymous sign-in of this page load, shared by every caller. */
let signingIn: Promise<firebase.User> = null;
/** Sign-in took longer than a full wait on this page load. */
let signInSlow = false;

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
    // GAME_OVER: the rematch's PIN when its lobby is open, or that the game just ended.
    if (body && typeof body.rematch === 'string') {
        error.rematch = body.rematch;
    }
    if (body && body.justEnded === true) {
        error.justEnded = true;
    }
    return error;
}

@Injectable()
export class ApiService {
    gamesRef: firebase.database.Reference;
    crewsRef: firebase.database.Reference;
    timeDiff: Promise<number>;

    constructor(
        private http: Http,
        private sessionService: SessionService,
        private zone: NgZone,
    ) {
        this.gamesRef = firebase.database().ref('games');
        this.crewsRef = firebase.database().ref('crews');
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

    /** Whether the server marks this game's host by the creating phone's host key (see host-key.ts). */
    getGameHasHost(pin: string) {
        pin = pin.toUpperCase();
        return this.get<boolean>(this.gamesRef.child(pin).child('hasHost'));
    }

    async createGame(locale: string, count: number, pack?: string, campaign?: string): Promise<{ pin: string }> {
        // The creating browser's anonymous uid marks the host, so BigQuery can
        // tell whether hosts come back. Creating never waits long for sign-in:
        // without a uid the game is made all the same, and anyone may start it.
        // The host key marks the host either way, so the lobby knows it even without a uid.
        const { uid, waitedMs } = await this.uidWithin(SIGN_IN_WAIT_MS);
        const hostKey = newHostKey();
        const resp = await this.post<{ pin: string }>(`newGame`, {
            locale, count, uid, pack: pack || null, campaign: campaign || null, clientWaitMs: waitedMs, hostKey,
            // This client starts through startGame, so the server may refuse START ticks for this game.
            serverStart: true,
        });
        rememberHostKey(resp && resp.pin, hostKey);
        return resp;
    }

    /**
     * Start signing this browser in anonymously, once. Pages call this when they open,
     * so sign-in is usually done by the time a player taps. Where Google's sign-in
     * script fails to load, this takes 20 to 30 seconds and resolves to undefined.
     */
    warmUpSignIn(): Promise<firebase.User> {
        if (!signingIn) {
            signingIn = (async () => {
                try {
                    const auth = firebase.auth();
                    const user = auth.currentUser || await auth.signInAnonymously();
                    signInSlow = false;
                    return user;
                } catch (error) {
                    signingIn = null; // let a later page try again
                    reportError(error, 'signIn');
                    return undefined;
                }
            })();
        }
        return signingIn;
    }

    /** The signed-in user if sign-in finishes within maxWaitMs, and how long we waited. */
    async userWithin(maxWaitMs: number): Promise<{ user: firebase.User; waitedMs: number }> {
        const started = Date.now();
        // Once sign-in has outlasted one full wait, the host's next tap (Join after Create) does not wait again.
        const wait = signInSlow ? 0 : maxWaitMs;
        let timedOut = false;
        const user = await Promise.race([
            this.warmUpSignIn(),
            new Promise<firebase.User>(resolve => setTimeout(() => { timedOut = true; resolve(undefined); }, wait)),
        ]);
        if (timedOut) {
            signInSlow = true;
        }
        return { user: user || undefined, waitedMs: Date.now() - started };
    }

    async uidWithin(maxWaitMs: number): Promise<{ uid: string; waitedMs: number }> {
        const { user, waitedMs } = await this.userWithin(maxWaitMs);
        return { uid: user ? user.uid : undefined, waitedMs };
    }

    /** This browser's anonymous uid, signing in if needed; undefined if that fails. */
    async currentUid(): Promise<string> {
        const user = await this.warmUpSignIn();
        return user ? user.uid : undefined;
    }

    async join(pin: string, nickname: string, uid: string) {
        pin = pin.toUpperCase();
        const hostKey = hostKeyFor(pin) || null;
        // nickname: the name the server stored (cut to 9, or a sweet name if the typed one was a slur
        // or a sex word, with swapped set). Older functions send only pid.
        return this.post<{ pid: string; nickname?: string; swapped?: boolean }>(`join`, { pin, nickname, uid, hostKey })
            .then(resp => ({ pid: resp.pid, nickname: resp.nickname || nickname, swapped: !!resp.swapped }));
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

    /** The game's seasonal question pack, or null. */
    getGamePack(pin: string): Promise<string> {
        pin = pin.toUpperCase();
        return this.get<string>(this.gamesRef.child(pin).child('pack')).catch(() => null);
    }

    /** Each player's best lie of the game (games/$pin/highlights), for the final screen. */
    getHighlights(pin: string) {
        pin = pin.toUpperCase();
        return this.get<Highlights>(this.gamesRef.child(pin).child('highlights'));
    }

    /** The question highlights were first kept from (0: the whole game), or null for an older game. */
    getHighlightsFrom(pin: string) {
        pin = pin.toUpperCase();
        return this.get<number>(this.gamesRef.child(pin).child('highlightsFrom'));
    }

    getGameLocale(pin: string) {
        pin = pin.toUpperCase();
        return this.get<string>(this.gamesRef.child(pin).child('locale'));
    }

    /** What the writing screen needs to decide on the round-1 lie helper. */
    async getLieHelperInfo(pin: string) {
        pin = pin.toUpperCase();
        const game = this.gamesRef.child(pin);
        const [coach, roundIndex, questionIndex, locale] = await Promise.all([
            this.get<boolean>(game.child('coach')).catch(() => false),
            this.get<number>(game.child('roundIndex')),
            this.get<number>(game.child('questionIndex')),
            this.get<string>(game.child('locale')),
        ]);
        return { coach: !!coach, roundIndex: roundIndex || 0, questionIndex: questionIndex || 0, locale };
    }

    /** This player's ready-made lies for the current question (round 1 of a coach game), or []. */
    async getMyIdeas(pin: string): Promise<string[]> {
        pin = pin.toUpperCase();
        const user = this.sessionService.user;
        if (!user || !user.pid) {
            return [];
        }
        const ideas = await this.get<string[]>(this.gamesRef.child(pin).child('ideas').child(user.pid)).catch(() => null);
        return Array.isArray(ideas) ? ideas.filter(i => typeof i === 'string' && i) : [];
    }

    /** This phone's player id, or undefined on the big screen and on a phone that has not joined. */
    private myPid(): string {
        const user = this.sessionService.user;
        return user && user.pid ? user.pid : undefined;
    }

    async didAnswerSubmitted(pin: string) {
        pin = pin.toUpperCase();
        const pid = this.myPid();
        if (!pid) {
            return false;
        }
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
        return answersList(allAnswers, this.sessionService.presenter ? undefined : this.myPid());
    }

    async didAnswerSelected(pin: string) {
        pin = pin.toUpperCase();
        // The big screen has no player: it used to throw here on every answers screen (Sentry BULLSHIT-WV).
        const pid = this.myPid();
        if (!pid) {
            return false;
        }
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
     * START in the lobby. The server checks that this phone may start the game: in a game with a
     * host key, only the phone that brings that key may, big screen or not.
     */
    startGame(pin: string) {
        pin = pin.toUpperCase();
        const hostKey = hostKeyFor(pin) || null;
        return this.post<{ started: boolean }>(`startGame`, { pin, hostKey });
    }

    /**
     * The host's lobby page reports that it is still there, so the group can start without a host
     * whose phone died (see hostSeen in game-model). Only the browser with the host key reports.
     */
    hostHere(pin: string) {
        pin = pin.toUpperCase();
        const hostKey = hostKeyFor(pin);
        if (!hostKey) {
            return Promise.resolve({ seen: false });
        }
        return this.post<{ seen: boolean }>(`hostHere`, { pin, hostKey });
    }

    /** Server time the host last reported in, live. Errors until the rules that expose it are deployed. */
    getHostSeenObservable(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<number>(this.gamesRef.child(pin).child('hostSeen'));
    }

    /** How far this phone's clock is ahead of the server's, in ms. */
    clockAhead(): Promise<number> {
        return this.serverNow().then(now => Date.now() - now);
    }

    /** This browser holds the host key for this game (it created or replayed it). */
    holdsHostKey(pin: string): boolean {
        return !!hostKeyFor(pin.toUpperCase());
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
        const { uid } = await this.uidWithin(SIGN_IN_WAIT_MS);
        // The player who pressed Replay hosts the new game; the server marks them by their player id.
        const user = this.sessionService.user;
        const pid = user && user.pid ? user.pid : null;
        // A new host key for the new game: with it, only this phone may start it.
        const hostKey = pid ? newHostKey() : null;
        const resp = await this.post<{ pin?: string; host?: boolean; hostKey?: string }>(`fork`, { pin, uid, pid, hostKey });
        // Another phone pressed Replay first: the server hands this phone that game's key (it may start it
        // too), or says it is a guest there (host: false) and keeps no key.
        if (hostKey && resp && resp.pin && resp.host !== false) {
            rememberHostKey(resp.pin, resp.hostKey || hostKey);
        }
        return resp;
    }

    getForkGame(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<string>(this.gamesRef.child(pin).child('fork'));
    }

    /** The crew a game counts for, as it changes (null when it has none). */
    getGameCrewObservable(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<string>(this.gamesRef.child(pin).child('crew'));
    }

    getGameCrew(pin: string) {
        pin = pin.toUpperCase();
        return this.get<string>(this.gamesRef.child(pin).child('crew'));
    }

    getCrew(id: string) {
        return this.get<Crew>(this.crewsRef.child(id.toLowerCase()));
    }

    getCrewObservable(id: string) {
        return this.observe<Crew>(this.crewsRef.child(id.toLowerCase()));
    }

    async createCrew(pin: string, name: string) {
        pin = pin.toUpperCase();
        const uid = await this.currentUid();
        return this.post<{ id: string; name: string }>(`createCrew`, { pin, name, uid });
    }

    async crewRematch(crew: string) {
        const { uid } = await this.uidWithin(SIGN_IN_WAIT_MS);
        const hostKey = newHostKey();
        const resp = await this.post<{ pin: string; created: boolean }>(`crewRematch`, { crew, uid, hostKey, serverStart: true });
        if (resp && resp.created) {
            rememberHostKey(resp.pin, hostKey);
        }
        return resp;
    }

    /**
     * Counts one share in BigQuery (game night sends from a crew page, lobby invites). Fire and forget:
     * never throws, and the page does not wait on it.
     */
    async logShare(contentType: string, method: string, extra: { crew?: string; locale?: string } = {}) {
        try {
            const uid = await this.currentUid();
            await this.post('onShare', { content_type: contentType, method, uid, ...extra });
        } catch (e) { }
    }

    /**
     * Sign in for joining, waiting at most SIGN_IN_WAIT_MS; resolves to undefined
     * if sign-in is slower or fails. The join is still counted when sign-in
     * finishes later.
     */
    async signInAnonymously(pin: string, nickname: string, via?: string) {
        const signIn = this.warmUpSignIn();
        signIn.then(user => {
            if (user) {
                this.post('onJoinGame', { uid: user.uid, pin, nickname, via }).catch(() => { });
            }
        });
        const { user } = await this.userWithin(SIGN_IN_WAIT_MS);
        return user;
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
