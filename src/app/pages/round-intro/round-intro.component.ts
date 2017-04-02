import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';

const roundPoints = {
    one: { truth: 1000, bullshit: 800 },
    two: { truth: 1500, bullshit: 1200 },
    three: { truth: 2000, bullshit: 2500 },
};

@Component({
    selector: 'app-round-intro',
    templateUrl: './round-intro.component.html',
    styleUrls: ['./round-intro.component.scss']
})
export class RoundIntroComponent implements OnInit, OnDestroy {
    pin: string;
    number: string;
    presenter: boolean;
    points;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.number = this.activatedRoute.snapshot.params['number'];
        this.presenter = !!this.sessionService.presenter;
        this.points = roundPoints[this.number];
        this.gameService.register(this.pin);
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
    }

}
