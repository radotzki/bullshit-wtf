import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-game-header',
    templateUrl: './game-header.component.html',
    styleUrls: ['./game-header.component.scss']
})
export class GameHeaderComponent implements OnInit {
    pin: string;
    @Input() button: string;
    @Input() buttonLoading: boolean;
    @Output() onClick: EventEmitter<any> = new EventEmitter();

    constructor(
        private activatedRoute: ActivatedRoute,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
    }

}
