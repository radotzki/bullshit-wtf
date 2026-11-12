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

// The server ends each phase at its deadline. Phones only step in if the server is late,
// so they wait this much longer before ticking themselves.
const clientFallbackDelay = 2500;

@Injectable()
export class GameService implements CanActivate {
    private game: Subscription;
    /** The game this phone follows, in capitals. */
    private pin: string;
    private timeout;
    private current: GameState;

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
        this.game = this.apiService.gameState(pin).subscribe(state => {
            // A step of a game this phone has left since must not move it.
            if (this.pin === next) {
                this.handleGameState(pin, state);
            }
        });
    }

    unregister() {
        this.pin = undefined;
        this.clearTimer();
        if (this.game) {
            this.game.unsubscribe();
            this.game = undefined;
        }
    }

    private handleGameState(pin: string, state: GameState) {
        this.clearTimer();
        this.current = state;

        switch (state) {
            case GameState.GameStaging:
                this.router.navigate(['game-staging', pin]);
                break;

            case GameState.RoundIntro:
                this.router.navigate(['round-intro', pin]);
                this.fallbackTick(pin, state);
                break;

            case GameState.ShowQuestion:
                this.router.navigate(['show-question', pin]);
                this.fallbackTick(pin, state);
                break;

            case GameState.ShowAnswers:
                this.router.navigate(['show-answers', pin]);
                this.fallbackTick(pin, state);
                break;

            case GameState.RevealTheTruth:
                this.router.navigate(['reveal-the-truth', pin]);
                this.fallbackTick(pin, state);
                break;

            case GameState.ScoreBoard:
                // The staged reveal shows the scores itself, and the server gives this phase no time:
                // the reveal page stays up until the next question. (A phone that opens the game right
                // in this phase is not on the reveal page, and gets the scoreboard as before.)
                // A phone that has left this game while that was read (BACK HOME, another game) stays
                // where it went: the scoreboard page would make it follow the old game again. What the
                // phone follows is read a moment later, since a first step can arrive while the phone is
                // still starting to follow the game.
                const followed = Promise.resolve().then(() => this.game);
                Promise.all([this.apiService.isStagedReveal(pin), followed]).then(([staged, game]) => {
                    const onReveal = this.router.url.indexOf('/reveal-the-truth/') === 0;
                    const stillHere = !!game && this.game === game;
                    if (stillHere && this.current === GameState.ScoreBoard && !(staged && onReveal)) {
                        this.router.navigate(['score-board', pin]);
                    }
                });
                this.fallbackTick(pin, state);
                break;

            case GameState.ScoreBoardFinal:
                this.router.navigate(['score-board-final', pin]);
                break;
        }
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
