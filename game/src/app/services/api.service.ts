import { reportError } from './../sentry/sentry.module';
import {
    GamePlayers, Answers, GameState, GameStateInfo, RevealAnswer, Crew, Highlights,
    Taste, tasteOf,
    WaitingRow, waitingRow, AnswerSelection, pickIsFor,
} from './../game-model';
import { SessionService } from './session.service';
import { answersList } from './answers-list';
import { newHostKey, rememberHostKey, hostKeyFor } from './host-key';
import { startReconnectNudge, pageVisible } from './reconnect-nudge';
import { clockSync } from './clock-sync';
import { Observable, Subscriber, Subscription, firstValueFrom } from 'rxjs';
import { map, share } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { environment } from '../../environments/environment';
import firebaseCompat from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';

const firebase = firebaseCompat.initializeApp(environment.firebaseConfig);

/** The page's one reconnect nudge (see reconnect-nudge.ts), started with the first ApiService. */
let nudging = false;
function keepReconnecting() {
    if (nudging) {
        return;
    }
    nudging = true;
    const db = firebase.database();
    const connected = db.ref('.info/connected');
    startReconnectNudge({
        onConnected: listener => {
            const cb = connected.on('value', snap => listener(snap.val() === true));
            return () => connected.off('value', cb);
        },
        goOnline: () => db.goOnline(),
        isVisible: pageVisible,
        setInterval: (fn, ms) => setInterval(fn, ms),
        clearInterval: handle => clearInterval(handle),
    });
}

/** The longest a tap on Create, Join, Replay or Rematch waits for sign-in. */
export const SIGN_IN_WAIT_MS = 1500;

/** The one anonymous sign-in of this page load, shared by every caller. */
let signingIn: Promise<firebaseCompat.User> = null;
/** Sign-in took longer than a full wait on this page load. */
let signInSlow = false;

/**
 * Build a real Error from a failed call to a cloud function, keeping the
 * server's message and code when it sent JSON, and the HTTP status always.
 */
function apiError(url: string, resp: any) {
    let body: any;

    try {
        body = resp && resp.error && typeof resp.error === 'object' ? resp.error : null;
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
    gamesRef: firebaseCompat.database.Reference;
    crewsRef: firebaseCompat.database.Reference;
    /** How far this phone's clock is ahead of the server's (see clock-sync.ts). */
    private timeDiff = clockSync(
        () => this.post<{ now: number }>('time').then(({ now }) => Date.now() - now),
        err => reportError(err, 'time'),
    );
    private stagedReveal: { [pin: string]: Promise<boolean> } = {};
    private gameLocales: { [pin: string]: string } = {};

    constructor(
        private http: HttpClient,
        private sessionService: SessionService,
        private zone: NgZone,
    ) {
        this.gamesRef = firebase.database().ref('games');
        this.crewsRef = firebase.database().ref('crews');
        this.zone.runOutsideAngular(() => keepReconnecting());
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

    /**
     * Whether the server marks this game's host by the creating phone's host key (see host-key.ts):
     * true, or 'screen' once the host made their computer the big screen (see hostToBigScreen).
     */
    getGameHasHost(pin: string) {
        pin = pin.toUpperCase();
        return this.get<boolean | 'screen'>(this.gamesRef.child(pin).child('hasHost'));
    }

    /** The same, live: it changes in the lobby when the host makes their computer the big screen. */
    getGameHasHostObservable(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<boolean | 'screen'>(this.gamesRef.child(pin).child('hasHost'));
    }

    /**
     * The host's computer becomes the big screen: the server frees the host's seat and marks the game as
     * hosted from its big screen. Only the browser with the game's host key may ask, in the lobby.
     */
    hostToBigScreen(pin: string) {
        pin = pin.toUpperCase();
        const hostKey = hostKeyFor(pin) || null;
        return this.post<{ screen: boolean }>(`hostToBigScreen`, { pin, hostKey });
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
            // This client can show the staged reveal, so the server may draw this game into its 50/50 test.
            stagedReveal: true,
        });
        rememberHostKey(resp && resp.pin, hostKey);
        return resp;
    }

    /**
     * Start signing this browser in anonymously, once. Pages call this when they open,
     * so sign-in is usually done by the time a player taps. Where Google's sign-in
     * script fails to load, this takes 20 to 30 seconds and resolves to undefined.
     */
    warmUpSignIn(): Promise<firebaseCompat.User> {
        if (!signingIn) {
            signingIn = (async () => {
                try {
                    const auth = firebase.auth();
                    const user = auth.currentUser || (await auth.signInAnonymously()).user;
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
    async userWithin(maxWaitMs: number): Promise<{ user: firebaseCompat.User; waitedMs: number }> {
        const started = Date.now();
        // Once sign-in has outlasted one full wait, the host's next tap (Join after Create) does not wait again.
        const wait = signInSlow ? 0 : maxWaitMs;
        let timedOut = false;
        const user = await Promise.race([
            this.warmUpSignIn(),
            new Promise<firebaseCompat.User>(resolve => setTimeout(() => { timedOut = true; resolve(undefined); }, wait)),
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
        // pid: this phone's last player id. If that seat is in this game (the phone came Back to the join
        // page, or reloaded it), the server gives the seat back instead of adding a second one.
        const user = this.sessionService.user;
        const pid = user && user.pid ? user.pid : null;
        return this.post<{ pid: string; nickname?: string; swapped?: boolean }>(`join`, { pin, nickname, uid, hostKey, pid })
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

    /**
     * Who has sent a lie or a pick in the phase the game is on, and who the room waits for, live
     * (see waitingRow in game-model). Read from the players and the game's state, which every phone
     * may read; the lies and the picks themselves are not read for it.
     */
    waitingRow(pin: string) {
        pin = pin.toUpperCase();
        const game = this.gamesRef.child(pin);

        return new Observable<WaitingRow>((observer: Subscriber<WaitingRow>) => {
            let players: GamePlayers;
            let state: GameStateInfo;
            let facts: number[];
            const subs: Subscription[] = [];
            const next = () => {
                if (players && state && facts) {
                    observer.next(waitingRow(players, state, facts[0], facts[1]));
                }
            };

            // The question's index and the time the game was made do not change within a phase.
            Promise.all([this.get<number>(game.child('questionIndex')), this.get<number>(game.child('timestamp'))])
                .then(read => { facts = read; next(); }, err => observer.error(err));
            subs.push(this.observe<GameStateInfo>(game.child('state'))
                .subscribe(s => { state = s; next(); }, err => observer.error(err)));
            subs.push(this.getPlayersObservable(pin)
                .subscribe(p => { players = p; next(); }, err => observer.error(err)));

            return () => subs.forEach(s => s.unsubscribe());
        });
    }

    gameState(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<number>(this.gamesRef.child(pin).child('state').child('id'));
    }

    /**
     * The game's step with the time it began, live. Unlike gameState, a new question (or new picks)
     * after a phone was away is news even when the step's id is the same as the one the phone last saw.
     */
    gamePhase(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<GameStateInfo>(this.gamesRef.child(pin).child('state'));
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
        return this.timeDiff().then(diff => Date.now() - diff);
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

    /**
     * The taste this game is (five pick-only questions for a host who started alone), or null for any
     * other game. The server says so on the game's state; a state that cannot be read is no taste.
     */
    getTaste(pin: string): Promise<Taste> {
        pin = pin.toUpperCase();
        return this.get<any>(this.gamesRef.child(pin).child('state')).then(state => tasteOf(state), () => null);
    }

    getGameLocale(pin: string) {
        pin = pin.toUpperCase();
        return this.get<string>(this.gamesRef.child(pin).child('locale')).then(locale => {
            this.gameLocales[pin] = locale;
            return locale;
        });
    }

    /**
     * The game's language as last read on this phone, without waiting: 'en' until it was read once.
     * The game screens start from it, so a Hebrew game's next screen is in Hebrew from its first paint.
     */
    knownGameLocale(pin: string): string {
        return this.gameLocales[String(pin || '').toUpperCase()] || 'en';
    }

    /**
     * Whether this game plays the staged reveal (a 50/50 test set when the game is made). The server
     * says so on the game's state (state.staged === true), on every state from the lobby on. Asked once
     * per game. False when it cannot be read (a network error): the phone then shows today's reveal,
     * which every game can play.
     */
    isStagedReveal(pin: string): Promise<boolean> {
        pin = pin.toUpperCase();
        if (!this.stagedReveal[pin]) {
            this.stagedReveal[pin] = this.get<boolean>(this.gamesRef.child(pin).child('state').child('staged'))
                .then(v => v === true, () => {
                    delete this.stagedReveal[pin];
                    return false;
                });
        }
        return this.stagedReveal[pin];
    }

    /**
     * Whether this phone plays the game's sounds: a staged-reveal game with no big screen. With a
     * big screen in the room, the big screen plays them, as it always has, and phones stay quiet.
     */
    phoneSound(pin: string): Promise<boolean> {
        return Promise.all([this.isStagedReveal(pin), this.gameHasPresenter(pin).catch(() => false)])
            .then(([staged, hasPresenter]) => staged && !hasPresenter);
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
        const userAnswer = await this.get<unknown>(this.gamesRef.child(pin).child('answers').child(pid));
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
        const [userAnswer, state] = await Promise.all([
            this.get<unknown>(this.gamesRef.child(pin).child('answerSelections').child(pid)),
            this.get<GameStateInfo>(this.gamesRef.child(pin).child('state')),
        ]);
        // A pick this phone made in an earlier question, sent late after it was offline, is not this
        // question's pick: the phone can still pick here.
        return !!userAnswer && pickIsFor(userAnswer, state);
    }

    /**
     * `step` is the picks step the phone shows (see phaseKey in game.service): the server counts the
     * pick only in that step, so one kept while the phone was offline and sent later counts nowhere.
     */
    chooseAnswer(pin: string, answer: string, step?: string) {
        pin = pin.toUpperCase();
        const pid = this.sessionService.user.pid;
        const pick: AnswerSelection = { text: answer.toLowerCase() };
        if (step) {
            pick.step = step;
        }
        return this.gamesRef.child(pin).child('answerSelections').child(pid).set(pick);
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

    /**
     * How far this phone's clock is ahead of the server's, in ms, or null when the server could not
     * be asked this time (the next call asks again). Never a guessed 0: see clock-sync.ts.
     */
    clockAhead(): Promise<number | null> {
        return this.timeDiff(null);
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

    /**
     * This player laughs at a lie on the reveal (see laughCount in game-model). Through the `laugh`
     * function, since a phone may not write the reveal rows itself. Resolves to { taken, laughs }.
     */
    laugh(pin: string, text: string) {
        pin = pin.toUpperCase();
        const pid = this.myPid();
        if (!pid) {
            return Promise.reject(new Error('Only a player can laugh'));
        }
        return this.post<{ taken: boolean; laughs?: number }>('laugh', { pin, pid, text });
    }

    /** The reveal's rows as they change: the laughs arrive on them while the reveal is on. */
    revealAnswersLive(pin: string) {
        pin = pin.toUpperCase();
        return this.observe<RevealAnswer[]>(this.gamesRef.child(pin).child('revealAnswers'));
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
            .pipe(map(done => Object.keys(done || {}).length));
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
        // stagedReveal: this client can show the staged reveal (each Replay is a new draw of that test).
        const resp = await this.post<{ pin?: string; host?: boolean; hostKey?: string }>(
            `fork`, { pin, uid, pid, hostKey, stagedReveal: true });
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
        const resp = await this.post<{ pin: string; created: boolean }>(
            `crewRematch`, { crew, uid, hostKey, serverStart: true, stagedReveal: true });
        if (resp && resp.created) {
            rememberHostKey(resp.pin, hostKey);
        }
        return resp;
    }

    /**
     * Counts one share in BigQuery (game night sends from a crew page, lobby invites, results-card shares,
     * presses on the after-game ask). Fire and forget:
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

    private post<T>(url: string, body: object = {}): Promise<T> {
        return firstValueFrom(this.http.post<T>(environment.cloudfunctions + url, body))
            .catch(resp => Promise.reject(apiError(url, resp)));
    }

    private observe<T>(query: firebaseCompat.database.Query, eventType: firebaseCompat.database.EventType = 'value') {
        return new Observable<T>((observer: Subscriber<T>) => {
            const listener = query.on(eventType, snap => {
                this.zone.run(() => {
                    observer.next(snap.val() as T);
                });
            }, err => observer.error(err));

            return () => query.off(eventType, listener);
        }).pipe(share());
    }

    private get<T>(ref): Promise<T> {
        return ref.once('value').then(s => s.val());
    }

}
