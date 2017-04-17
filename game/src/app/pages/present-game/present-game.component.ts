import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-present-game',
    templateUrl: './present-game.component.html',
    styleUrls: ['./present-game.component.scss']
})
export class PresentGameComponent implements OnInit {
    pin: string;
    loading: boolean;
    hide: boolean;

    constructor(
        private activatedRoute: ActivatedRoute,
        private sessionService: SessionService,
        private apiService: ApiService,
        private router: Router,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.queryParams['pin'];

        if (this.pin) {
            this.hide = true;
            this.submit();
        }
    }
    submit() {
        this.loading = true;

        this.apiService.joinAsPresenter(this.pin).then(() => {
            this.sessionService.presenter = true;
            this.router.navigate(['game-staging', this.pin]);
            this.loading = false;
        });
    }

}
