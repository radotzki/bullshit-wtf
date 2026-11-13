import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GameService } from './../../services/game.service';

/**
 * An empty page a phone passes through, unseen, to have the page of a step built again when the game
 * comes back to the same step (see GameService.showAgain). Opened by its address, it follows the game,
 * which sends the phone to the page of the step the game is on.
 */
@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-step',
    template: '',
})
export class StepComponent implements OnInit {
    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
    ) { }

    ngOnInit() {
        this.gameService.register(this.activatedRoute.snapshot.params['pin']);
    }
}
