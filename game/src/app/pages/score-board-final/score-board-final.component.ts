import { Subscription } from 'rxjs/Subscription';
import { SessionService } from './../../services/session.service';
import { Howl } from 'howler';
import { GameService } from './../../services/game.service';
import { ApiService } from './../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CrewService } from './../../services/crew.service';
import { reportError } from './../../sentry/sentry.module';

@Component({
    selector: 'app-score-board-final',
    templateUrl: './score-board-final.component.html',
    styleUrls: ['./score-board-final.component.scss']
})
export class ScoreBoardFinalComponent implements OnInit, OnDestroy {
    pin: string;
    loading: boolean;
    forkGameSubscription: Subscription;
    displayPlayers;
    sound: Howl;
    presenter: boolean;
    // Saved crews: this game's crew, or the form to save one.
    crewId: string;
    crewName: string;
    naming: boolean;
    newCrewName = '';
    savingCrew: boolean;
    crewError: string;
    crewSubscription: Subscription;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
        private crewService: CrewService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameService.register(this.pin);
        this.playMusic();
        this.apiService.getPlayers(this.pin).then(resp => {
            const players = Object.keys(resp).map(k => resp[k]);
            this.displayPlayers = players
                .map((p, i) => Object.assign(p, { picture: `avatar${i}.png` }))
                .sort((a, b) => a.score < b.score ? 1 : -1);
        });

        this.crewSubscription = this.apiService.getGameCrewObservable(this.pin).subscribe(id => this.onCrew(id));

        this.forkGameSubscription = this.apiService.getForkGame(this.pin).subscribe(async fork => {
            if (fork) {
                if (!this.presenter) {
                    await this.apiService.signInAnonymously(fork, this.sessionService.user.nickname, 'replay');
                }

                this.gameService.unregister();
                this.gameService.register(fork);
            }
        });
    }

    ngOnDestroy() {
        this.forkGameSubscription.unsubscribe();
        this.crewSubscription.unsubscribe();

        if (this.sound) {
            this.sound.fade(1, 0, 1000);
            setTimeout(this.sound.stop, 1000);
        }
    }

    replay() {
        this.loading = true;
        this.apiService.fork(this.pin);
    }

    private async onCrew(id: string) {
        this.crewId = id || undefined;
        if (!id) {
            return;
        }
        this.naming = false;
        const crew = await this.apiService.getCrew(id);
        this.crewName = crew ? crew.name : '';
        const user = !this.presenter && this.sessionService.user;
        this.crewService.remember(id, this.crewName, user ? user.nickname : undefined);
    }

    startNaming() {
        this.naming = true;
        this.crewError = '';
    }

    async saveCrew() {
        const name = (this.newCrewName || '').trim();
        if (!name || this.savingCrew) {
            return;
        }
        this.savingCrew = true;
        this.crewError = '';
        try {
            const crew = await this.apiService.createCrew(this.pin, name);
            // The game's crew field updates too; this just makes it show at once.
            await this.onCrew(crew.id);
        } catch (err) {
            this.crewError = (err && err.message) || 'Could not save the crew';
            reportError(err, 'createCrew', { pin: this.pin });
        }
        this.savingCrew = false;
    }

    playMusic() {
        if (this.presenter) {
            this.sound = new Howl({
                src: ['/assets/sounds/final.mp3'],
                autoplay: true,
                loop: true,
            });
        }
    }
}
