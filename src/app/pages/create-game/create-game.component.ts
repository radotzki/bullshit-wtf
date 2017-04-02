import { GameService } from './../../services/game.service';
import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { Component } from '@angular/core';

@Component({
    selector: 'app-create-game',
    templateUrl: './create-game.component.html',
    styleUrls: ['./create-game.component.scss']
})
export class CreateGameComponent {
    language = 'en';
    length = 7;
    loading: boolean;
    errorMsg: string;
    chooseMode: boolean;
    pin: string;

    constructor(
        private apiService: ApiService
    ) { }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.createGame(this.language, this.length)
            .then((resp) => {
                this.loading = false;
                this.chooseMode = true;
                this.pin = resp.pin;
            })
            .catch(err => {
                this.loading = false;
                this.errorMsg = 'oops, something went wrong. Please try again';
                Raven.captureException(new Error(JSON.stringify(err)));
            });
    }

}
