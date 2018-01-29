import { Subscription } from 'rxjs/Subscription';
import { SessionService } from './../../services/session.service';
import * as Raven from 'raven-js';
import { Howl } from 'howler';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-score-board-final',
    templateUrl: './score-board-final.component.html',
    styleUrls: ['./score-board-final.component.scss']
})
export class ScoreBoardFinalComponent implements OnInit, OnDestroy {
    pin: string;
    loading: boolean;
    forkGameSubscription: Subscription;
    displayPlayers;
    sound: Howl;
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
        this.playMusic();
        this.apiService.getPlayers(this.pin).then(resp => {
            const players = Object.keys(resp).map(k => resp[k]);
            this.displayPlayers = players
                .map((p, i) => Object.assign(p, { picture: `avatar${i}.png` }))
                .sort((a, b) => a.score < b.score ? 1 : -1);
        });

        this.forkGameSubscription = this.apiService.getForkGame(this.pin).subscribe(async fork => {
            if (fork) {
                if (!this.presenter) {
                    await this.apiService.signInAnonymously(fork, this.sessionService.user.nickname);
                }

                this.gameService.unregister();
                this.gameService.register(fork);
            }
        });
    }

    ngOnDestroy() {
        this.forkGameSubscription.unsubscribe();

        if (this.sound) {
            this.sound.fade(1, 0, 1000);
            setTimeout(this.sound.stop, 1000);
        }
    }

    replay() {
        this.loading = true;
        this.apiService.fork(this.pin);
    }

    playMusic() {
        if (this.presenter) {
            this.sound = new Howl({
                src: ['/assets/sounds/final.mp3'],
                autoplay: true,
                loop: true,
            });
        }
    }
}
