import { GamePlayers, GamePlayer, GameState } from './../../game-model';
import { Subscription } from 'rxjs/Subscription';
import * as Raven from 'raven-js';
import { Howl } from 'howler';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
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
    players: GamePlayer[];
    playersSubscriber: Subscription;
    pin: string;
    presenter: boolean;
    errorMsg: string;
    loading: boolean;
    showStartButton: boolean;
    sound: Howl;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameService.register(this.pin);
        this.playMusic();
        this.playersSubscriber = this.apiService.getPlayersObservable(this.pin)
            .map(players => Object.keys(players || {}).map(k => players[k]))
            .subscribe(players => this.players = players);
        this.apiService.gameHasPresenter(this.pin).then(hasPresenter =>
            this.showStartButton = !hasPresenter || (hasPresenter && this.presenter)
        );
    }

    ngOnDestroy() {
        this.playersSubscriber.unsubscribe();

        if (this.sound) {
            this.sound.fade(1, 0, 1000);
            setTimeout(this.sound.stop, 1000);
        }
    }

    startGame() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.tick(this.pin, GameState.RoundIntro)
            .catch(err => {
                this.loading = false;
                Raven.captureException(new Error(JSON.stringify(err)));
                this.errorMsg = 'oops, something went wrong. Please try again';
            });
    }

    playMusic() {
        if (this.presenter) {
            this.sound = new Howl({
                src: ['/assets/sounds/staging.mp3'],
                autoplay: true,
                loop: true,
            });
        }
    }
}
