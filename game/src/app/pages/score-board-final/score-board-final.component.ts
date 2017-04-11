import { SessionService } from './../../services/session.service';
import * as Raven from 'raven-js';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-score-board-final',
    templateUrl: './score-board-final.component.html',
    styleUrls: ['./score-board-final.component.scss']
})
export class ScoreBoardFinalComponent implements OnInit {
    pin: string;
    displayPlayers;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.gameService.register(this.pin);
        this.apiService.getPlayers(this.pin).then(resp => {
            const players = Object.keys(resp).map(k => resp[k]);
            this.displayPlayers = players.sort((a, b) => a.score < b.score ? 1 : -1);
        });
    }

}
