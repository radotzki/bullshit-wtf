import { Subscription } from 'rxjs/Subscription';
import { GameScheme, GameState, GameStateInfo } from './../game-model';
import { ApiService } from './api.service';
import { Router, CanActivate, ActivatedRouteSnapshot } from '@angular/router';
import { Injectable } from '@angular/core';

export const durations = {
    [GameState.RoundIntro]: 3000,
    [GameState.ShowQuestion]: 25000,
    [GameState.ShowAnswers]: 20000,
    [GameState.ScoreBoard]: 3000,
};

/** The page of each step of a game. */
const pages = {
    [GameState.GameStaging]: 'game-staging',
    [GameState.RoundIntro]: 'round-intro',
    [GameState.ShowQuestion]: 'show-question',
    [GameState.ShowAnswers]: 'show-answers',
    [GameState.RevealTheTruth]: 'reveal-the-truth',
    [GameState.ScoreBoard]: 'score-board',
    [GameState.ScoreBoardFinal]: 'score-board-final',
};

/** The steps with a deadline, on which every phone keeps a backup timer. */
const timedSteps = [GameState.RoundIntro, GameState.ShowQuestion, GameState.ShowAnswers, GameState.RevealTheTruth, GameState.ScoreBoard];

/** The steps that come round again in a game, each time with its own page. */
const rebuiltSteps = timedSteps;

/**
 * Names one occurrence of a step: its id and the time it began, as the server's stateKey does.
 * Undefined for a game that has no step (gone, or not there yet).
 */
export function phaseKey(state: GameStateInfo): string {
    return state && typeof state.id === 'number' ? `${state.id}:${state.timestamp}` : undefined;
}

// The server ends each phase at its deadline. Phones only step in if the server is late,
// so they wait this much longer before ticking themselves.
const clientFallbackDelay = 2500;

@Injectable()
export class GameService implements CanActivate {
    private game: Subscription;
    /** The game this phone follows, in capitals. */
    private pin: string;
    private timeout;
    /** The step this phone was last sent to: its id and the time it began (see phaseKey). */
    private phase: string;
    private stepId: GameState;

    constructor(
        private router: Router,
        private apiService: ApiService,
    ) { }

    /**
     * Follow this game: the phone goes to whatever step the game is on, and moves with it.
     * A phone follows one game at a time. Asking for another game (a crew rematch, a second PIN,
     * the back button) drops the one before, however the phone got here; asking for the same
     * game again changes nothing.
     */
    register(pin: string) {
        const next = String(pin || '').toUpperCase();
        if (this.game && this.pin === next) {
            return;
        }
        this.unregister();
        this.pin = next;
        this.game = this.apiService.gamePhase(pin).subscribe(state => {
            // A step of a game this phone has left since must not move it.
            if (this.pin === next) {
                this.handleGameState(pin, state);
            }
        });
    }

    unregister() {
        this.pin = undefined;
        this.phase = undefined;
        this.stepId = undefined;
        this.clearTimer();
        if (this.game) {
            this.game.unsubscribe();
            this.game = undefined;
        }
    }

    private handleGameState(pin: string, state: GameStateInfo) {
        const id = state ? state.id : undefined;
        const key = phaseKey(state);

        // The same step as before, with only something else on it changed: nothing to do.
        if (key && key === this.phase) {
            return;
        }

        // A new question, new picks or a new round on the page the phone already shows: a phone that
        // was away while the game went round once comes back to the same page. Angular keeps a page
        // whose address has not changed, with what it knew of the step before (that its lie was sent,
        // its pick made, the old question), so that page is built again, as a phone that never left gets it.
        const again = !!key && !!this.phase && id === this.stepId && rebuiltSteps.indexOf(id) >= 0;
        this.phase = key;
        this.stepId = id;
        this.clearTimer();

        const page = pages[id];
        if (!page) {
            return;
        }

        if (again) {
            this.showAgain(pin, page, key);
        } else {
            this.router.navigate([page, pin]);
        }

        if (timedSteps.indexOf(id) >= 0) {
            this.fallbackTick(pin, id);
        }
    }

    /**
     * Build the page again at the same address: the router keeps a page whose address has not changed,
     * so the phone passes through the empty step page first, without the address bar or the history seeing it.
     */
    private showAgain(pin: string, page: string, key: string) {
        Promise.resolve(this.router.navigate(['step', pin], { skipLocationChange: true })).then(() => {
            // Unless the phone moved on, or left the game, meanwhile.
            if (this.phase === key && this.pin !== undefined) {
                this.router.navigate([page, pin]);
            }
        }, () => undefined);
    }

    /**
     * Every phone, presenter or not, keeps a backup timer on the shared deadline the server set.
     * If the server has not moved the game on shortly after the deadline, the first awake phone does.
     * A phone that was asleep ticks as soon as it wakes, since its overdue timer fires then.
     */
    private fallbackTick(pin: string, stateId: GameState) {
        const following = this.pin;
        this.apiService.getGameStateInfo(pin).then(({ state, now }) => {
            // The phone may have moved to another game, or left, while this was read.
            if (!state || state.id !== stateId || this.pin !== following) {
                return;
            }

            const deadline = state.deadline || (state.timestamp + (durations[stateId] || 0));
            const timeRemain = Math.max(0, deadline - now) + clientFallbackDelay;
            this.timeout = setTimeout(() => this.apiService.tickFrom(pin, state), timeRemain);
        });
    }

    private clearTimer() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
    }

    canActivate(route: ActivatedRouteSnapshot) {
        const pin = route.params.pin;

        if (!pin || pin.length !== 4) {
            this.router.navigate(['/']);
            return false;
        } else {
            return true;
        }
    }
}
