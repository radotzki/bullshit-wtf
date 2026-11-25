import { GamePlayer } from './../../game-model';
import { scoreRows } from './score-rows';
import { SessionService } from './../../services/session.service';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-score-board',
    templateUrl: './score-board.component.html',
    styleUrls: ['./score-board.component.scss']
})
export class ScoreBoardComponent implements OnInit {
    pin: string;
    displayPlayers: (GamePlayer & { picture: string })[];
    presenter: boolean;
    /** A Hebrew game: names on the right, scores on the left. */
    rtl = false;

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
        this.rtl = this.apiService.knownGameLocale(this.pin) === 'he';
        this.apiService.getGameLocale(this.pin).then(locale => this.rtl = locale === 'he', () => null);
        // An old game reads no players (or is refused): an empty board, and the final screen next.
        this.apiService.getPlayers(this.pin)
            .then(resp => this.displayPlayers = scoreRows(resp), () => this.displayPlayers = []);
    }

}
