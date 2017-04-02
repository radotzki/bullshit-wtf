import { Game } from './../../models';
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
    score: number;

    constructor(
        private activatedRoute: ActivatedRoute,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        const pin = this.activatedRoute.snapshot.params['pin'];
        this.name = this.sessionService.user.name;
    }
}
