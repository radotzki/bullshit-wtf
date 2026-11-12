import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { gameStrings, GameStrings } from './../game-strings';

const roundPoints = [
    { truth: 1000, bullshit: 500 },
    { truth: 1500, bullshit: 750 },
    { truth: 2000, bullshit: 1000 },
];

@Component({
    selector: 'app-round-intro',
    templateUrl: './round-intro.component.html',
    styleUrls: ['./round-intro.component.scss']
})
export class RoundIntroComponent implements OnInit {
    pin: string;
    presenter: boolean;
    points: { truth?: number, bullshit?: number } = {};
    t: GameStrings = gameStrings('en');

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameService.register(this.pin);
        this.t = gameStrings(this.apiService.knownGameLocale(this.pin));
        this.apiService.getGameLocale(this.pin).then(locale => this.t = gameStrings(locale), () => null);
        this.apiService.getRoundIndex(this.pin).then(roundIndex => {
            this.points = roundPoints[roundIndex] || {};
        });
    }

    /** The two points lines show only once the round's points are read, never with a missing number. */
    get pointsKnown(): boolean {
        return this.points.truth > 0 && this.points.bullshit > 0;
    }

}
