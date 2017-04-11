import { GamePlayer } from './../../game-model';
import { SessionService } from './../../services/session.service';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { GameState } from '../../game-model';

@Component({
    selector: 'app-score-board',
    templateUrl: './score-board.component.html',
    styleUrls: ['./score-board.component.scss']
})
export class ScoreBoardComponent implements OnInit {
    pin: string;
    displayPlayers: (GamePlayer & { picture: string })[];
    presenter: boolean;

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
        this.apiService.getPlayers(this.pin).then(resp => {
            const players = Object.keys(resp).map(k => resp[k]);
            this.displayPlayers = players
                .map((p, i) => Object.assign(p, { picture: `avatar${i}.png` }))
                .sort((a, b) => a.score < b.score ? 1 : -1);
        });
    }

}
