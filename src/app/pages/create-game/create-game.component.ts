import * as Raven from 'raven-js';
import { ApiService } from './../../services/api.service';
import { categories } from './categories';
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

    constructor(
        private apiService: ApiService,
    ) { }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        const categoryNames = categories
            .filter(category => category.lang === this.language)
            .map(category => category.name);

        this.apiService.createGame(categoryNames, this.length)
            .then((resp) => {
                // TODO: go to game resp.name
                console.log('resp.name', resp.name);
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;
                this.errorMsg = 'oops, something went wrong. Please try again';
                Raven.captureException(new Error(JSON.stringify(err)));
            });
    }

}
