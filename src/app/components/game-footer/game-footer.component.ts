import { Game } from './../../models';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { SessionService } from './../../services/session.service';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
    selector: 'app-game-footer',
    templateUrl: './game-footer.component.html',
    styleUrls: ['./game-footer.component.scss']
})
export class GameFooterComponent implements OnInit, OnDestroy {
    name: string;
    uid: string;
    score: number;
    gameSubscription: Subscription;

    constructor(
        private activatedRoute: ActivatedRoute,
        private sessionService: SessionService,
        private gameService: GameService,
    ) { }

    ngOnInit() {
        const pin = this.activatedRoute.snapshot.params['pin'];
        this.name = this.sessionService.user.name;
        this.uid = this.sessionService.user.id;
        this.gameSubscription = this.gameService.feed(pin).subscribe(this.onGameChange.bind(this));
    }

    ngOnDestroy() {
        this.gameSubscription.unsubscribe();
    }

    onGameChange(game: Game) {
        // this.score = game.players.find(p => p.id === this.uid).score;
    }
}
