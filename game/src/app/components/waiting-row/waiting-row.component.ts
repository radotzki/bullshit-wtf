import { Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs/Subscription';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { WaitingRow } from './../../game-model';
import { GameStrings, gameStrings } from './../../pages/game-strings';
import { rowView, RowView, RowSeatView } from './waiting-row';

/**
 * Who the room is waiting for: every player's picture, a tick on those whose lie (or pick) is in,
 * dots on those the room still waits for, and "Waiting for Chen" when one is left.
 * It shows who has sent, never what: see sent.ts in the functions.
 */
@Component({
    selector: 'app-waiting-row',
    templateUrl: './waiting-row.component.html',
    styleUrls: ['./waiting-row.component.scss']
})
export class WaitingRowComponent implements OnInit, OnChanges, OnDestroy {
    @Input() pin: string;
    /** The game's words. */
    @Input() t: GameStrings = gameStrings('en');
    /** What the screen says while there is nothing to say about one player. */
    @Input() line = '';
    /** On the big screen the row is larger. */
    @Input() presenter = false;
    /** The big screen while answers are picked: the row sits in the bar on top (see rowView). */
    @Input() compact = false;

    view: RowView = { line: '', seats: [] };
    private row: WaitingRow;
    private rows: Subscription;

    constructor(private apiService: ApiService, private sessionService: SessionService) { }

    ngOnInit() {
        this.update();
        // If the row cannot be read the screen keeps its own line, as before.
        this.rows = this.apiService.waitingRow(this.pin).subscribe(row => {
            this.row = row;
            this.update();
        }, () => null);
    }

    ngOnChanges() {
        this.update();
    }

    ngOnDestroy() {
        if (this.rows) {
            this.rows.unsubscribe();
        }
    }

    seatId(index: number, seat: RowSeatView) {
        return seat.pid;
    }

    private update() {
        const user = this.presenter ? null : this.sessionService.user;
        this.view = rowView(this.row, this.line, this.t, this.compact, user && user.pid ? user.pid : undefined);
    }
}
