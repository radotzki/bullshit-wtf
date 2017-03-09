import { SessionService } from './../../services/session.service';
import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-game-footer',
    templateUrl: './game-footer.component.html',
    styleUrls: ['./game-footer.component.scss']
})
export class GameFooterComponent implements OnInit {
    name: string;

    constructor(
        private sessionService: SessionService
    ) { }

    ngOnInit() {
        this.name = this.sessionService.user.name;
    }

}
