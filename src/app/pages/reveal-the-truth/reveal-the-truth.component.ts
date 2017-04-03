import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import 'rxjs/add/operator/first';

const housePicture = 'homegrown-bullshit.png';

@Component({
    selector: 'app-reveal-the-truth',
    templateUrl: './reveal-the-truth.component.html',
    styleUrls: ['./reveal-the-truth.component.scss']
})
export class RevealTheTruthComponent implements OnInit, OnDestroy {
    gameSubscription: Subscription;
    pin: string;
    presenter: boolean;
    game;
    displayAnswers;
    displayIndex: number;
    displayInterval;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private apiService: ApiService,
        private sessionService: SessionService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.presenter = !!this.sessionService.presenter;
        this.gameSubscription = this.apiService.game(this.pin).first().subscribe(this.onGameChanged.bind(this));
        this.gameService.register(this.pin);
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
        this.gameSubscription.unsubscribe();

        if (this.displayInterval) {
            clearInterval(this.displayInterval);
        }
    }

    onGameChanged(resp) {
        // this.game = resp;
        // this.displayAnswers = this.createDisplayArray(
        //     this.game.players,
        //     this.game.currentQuestion.fakeAnswers,
        //     this.game.currentQuestion.realAnswer,
        // );
        // this.displayIndex = 0;
        // this.displayInterval = setInterval(() => {
        //     if (this.displayIndex < this.displayAnswers.length - 1) {
        //         this.displayIndex += 1;
        //     } else {
        //         this.tick();
        //     }
        // }, 5000);
    }

    tick() {
        // this.apiService.tick(this.pin, QuestionState.RevealTheTruth);
    }

    // createDisplayArray(players: Player[], fakeAnswers: Answer[], realAnswer: Answer) {
        // const relevantFakeAnswers = fakeAnswers.filter(fakeAnswer => fakeAnswer.selectedBy.length > 0);
        // const displayArray: Answer[] = [...relevantFakeAnswers].sort((a, b) => a.selectedBy.length < b.selectedBy.length ? -1 : 1);

        // displayArray.map(answer => {
        //     answer.selectedByUser = answer.selectedBy.map(playerName => this.getPlayerData(players, playerName));
        //     answer.createdByUser = answer.createdBy.map(playerName => this.getPlayerData(players, playerName));
        //     answer.houseLie = answer.createdByUser[0].picture === housePicture;
        //     return answer;
        // });

        // displayArray.push(Object.assign({}, realAnswer, {
        //     truth: true,
        //     selectedByUser: realAnswer.selectedBy.map(playerName => this.getPlayerData(players, playerName)),
        // }));

        // return displayArray;
    //     return [];
    // }

    // getPlayerData(players: Player[], playerName: string) {
    //     const houseObj = { name: 'Homegrown Bullshit', picture: housePicture };
    //     return players.find(player => player.name === playerName) || houseObj;
    // }

}
