import { ApiService } from './../../services/api.service';
import { Component } from '@angular/core';

@Component({
    selector: 'app-join-game',
    templateUrl: './join-game.component.html',
    styleUrls: ['./join-game.component.scss']
})
export class JoinGameComponent {
    pin: string;
    loading: boolean;
    errorMsg: string;

    constructor(
        private apiService: ApiService,
    ) { }

    submit() {
        this.loading = true;

        this.apiService.join(this.pin)
            .then(game => {
                // TODO: go to game
                console.log('game', game);
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;

                if (err.code === 'GAME_NOT_FOUND') {
                    this.errorMsg = 'This game does not exist';
                } else {
                    // TODO SENTRY
                    this.errorMsg = 'oops, something went wrong. Please try again';
                }
            });
    }

}
