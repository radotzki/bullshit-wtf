import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from './../../services/api.service';
import { GameService } from './../../services/game.service';
import { SessionService } from './../../services/session.service';
import { gameStrings, GameStrings } from './../game-strings';

/**
 * A phone that joined after START waits here for its first question (GamePlayer.late, see
 * GameService.waitingLate): "You're in from the next question", and the score it starts with, the
 * lowest at the table. The game moves the phone on to that question's own page when it comes.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-late-join',
    templateUrl: './late-join.component.html',
    styleUrls: ['./late-join.component.scss']
})
export class LateJoinComponent implements OnInit, OnDestroy {
    pin: string;
    t: GameStrings = gameStrings('en');
    /** This seat's starting score, once read. */
    score: number = null;
    nickname: string = null;
    private players: Subscription;

    constructor(
        private activatedRoute: ActivatedRoute,
        private apiService: ApiService,
        private gameService: GameService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.t = gameStrings(this.apiService.knownGameLocale(this.pin));
        this.apiService.getGameLocale(this.pin).then(locale => this.t = gameStrings(locale), () => undefined);
        this.gameService.register(this.pin);
        const user = this.sessionService.user;
        const pid = user && user.pid;
        this.players = this.apiService.getPlayersObservable(this.pin).subscribe(players => {
            const me = pid && players && players[pid];
            this.score = me && typeof me.score === 'number' ? me.score : null;
            this.nickname = me ? me.nickname : null;
        });
    }

    ngOnDestroy() {
        if (this.players) {
            this.players.unsubscribe();
        }
    }
}
