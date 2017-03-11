import { Subscription } from 'rxjs/Subscription';
import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Game } from './../../models';
import { Observable } from 'rxjs/Observable';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-game-staging',
    templateUrl: './game-staging.component.html',
    styleUrls: ['./game-staging.component.scss']
})
export class GameStagingComponent implements OnInit, OnDestroy {
    gameSubscription: Subscription;
    game: Game;
    pin: string;
    presenter: boolean;
    loading: boolean;
    errorMsg: string;
    leader: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameSubscription = this.gameService.feed(this.pin).subscribe(this.onGameChanged.bind(this));
        this.gameService.register(this.pin);
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
        this.gameSubscription.unsubscribe();
    }

    onGameChanged(resp: Game) {
        this.game = resp;
        this.leader = !this.sessionService.presenter && this.game.players[0].id === this.sessionService.user.id;
    }

    startGame() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.startGame(this.pin)
            .catch(err => {
                this.loading = false;
                Raven.captureException(new Error(JSON.stringify(err)));
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }
}

// const playersForTest = [
//         { "id": "2c7bb848-e90f-4b8f-81ab-ea1488029c65", "name": "John Doh1", "picture": "http://localhost:3333/images/avatar0.png" },
//         { "id": "2c7bb848-e90f-4b8f-81ab-ea1488029c61", "name": "John Doh2", "picture": "http://localhost:3333/images/avatar1.png" },
//         { "id": "2c7bb848-e90f-4b8f-81ab-ea1488029c62", "name": "John Doh3", "picture": "http://localhost:3333/images/avatar2.png" },
//         { "id": "2c7bb848-e90f-4b8f-81ab-ea1488029c63", "name": "John Doh4", "picture": "http://localhost:3333/images/avatar3.png" },
//         { "id": "2c7bb848-e90f-4b8f-81ab-ea1488029c64", "name": "John Doh5", "picture": "http://localhost:3333/images/avatar4.png" },
//         { "id": "2c7bb848-e90f-4b8f-81ab-ea1488029c66", "name": "John Doh6", "picture": "http://localhost:3333/images/avatar5.png" },
//         { "id": "2c7bb848-e90f-4b8f-81ab-ea1488029c68", "name": "John Doh7", "picture": "http://localhost:3333/images/avatar6.png" },
//         { "id": "2c7bb848-e90f-4b8f-81ab-ea1488029c69", "name": "John Doh8", "picture": "http://localhost:3333/images/avatar7.png" },
//     ];
