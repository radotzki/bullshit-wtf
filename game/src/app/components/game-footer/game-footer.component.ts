import { Observable } from 'rxjs/Observable';
import { ApiService } from './../../services/api.service';
import { Subscription } from 'rxjs/Subscription';
import { SessionService } from './../../services/session.service';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
    selector: 'app-game-footer',
    templateUrl: './game-footer.component.html',
    styleUrls: ['./game-footer.component.scss']
})
export class GameFooterComponent implements OnInit {
    name: string;
    score: Observable<number>;

    constructor(
        private activatedRoute: ActivatedRoute,
        private sessionService: SessionService,
        private apiService: ApiService,
    ) { }

    ngOnInit() {
        const pin = this.activatedRoute.snapshot.params['pin'];
        this.name = this.sessionService.user.nickname;

        if (!this.sessionService.presenter) {
            this.score = this.apiService.playerScore(pin, this.sessionService.user.pid);
        }
    }
}
