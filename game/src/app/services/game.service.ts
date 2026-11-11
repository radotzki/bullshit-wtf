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
    private timeout;
    private current: GameState;

    constructor(
        private router: Router,
        private apiService: ApiService,
    ) { }

    register(pin: string) {
        if (!this.game) {
            this.game = this.apiService.gameState(pin).subscribe(state => this.handleGameState(pin, state));
        }
    }

    unregister() {
        if (this.game) {
            this.game.unsubscribe();
            this.game = undefined;
            this.clearTimer();
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
                this.apiService.isStagedReveal(pin).then(staged => {
                    const onReveal = this.router.url.indexOf('/reveal-the-truth/') === 0;
                    if (this.current === GameState.ScoreBoard && !(staged && onReveal)) {
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
        this.apiService.getGameStateInfo(pin).then(({ state, now }) => {
            if (!state || state.id !== stateId) {
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
