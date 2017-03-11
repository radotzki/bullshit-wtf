import { SessionService } from './../../services/session.service';
import { ApiService } from './../../services/api.service';
import { Game, QuestionState, Answer, Player } from './../../models';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import 'rxjs/add/operator/first';

@Component({
    selector: 'app-reveal-the-truth',
    templateUrl: './reveal-the-truth.component.html',
    styleUrls: ['./reveal-the-truth.component.scss']
})
export class RevealTheTruthComponent implements OnInit, OnDestroy {
    gameSubscription: Subscription;
    pin: string;
    presenter: boolean;
    game: Game;
    displayAnswers: Answer[];
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
        this.gameSubscription = this.gameService.feed(this.pin).first().subscribe(this.onGameChanged.bind(this));
        this.gameService.register(this.pin);
    }

    ngOnDestroy() {
        this.gameService.unregister(this.pin);
        this.gameSubscription.unsubscribe();

        if (this.displayInterval) {
            clearInterval(this.displayInterval);
        }
    }

    onGameChanged(resp: Game) {
        this.game = resp;
        this.displayAnswers = this.createDisplayArray(
            this.game.players,
            this.game.currentQuestion.fakeAnswers,
            this.game.currentQuestion.realAnswer,
        );
        this.displayIndex = 0;
        this.displayInterval = setInterval(() => {
            if (this.displayIndex < this.displayAnswers.length - 1) {
                this.displayIndex += 1;
            } else {
                this.tick();
            }
        }, 5000);
    }

    tick() {
        this.apiService.tick(this.pin, QuestionState.RevealTheTruth);
    }

    createDisplayArray(players: Player[], fakeAnswers: Answer[], realAnswer: Answer) {
        const relevantFakeAnswers = fakeAnswers.filter(fakeAnswer => fakeAnswer.selectedBy.length > 0);
        const displayArray: Answer[] = relevantFakeAnswers.sort((a, b) => a.selectedBy.length < b.selectedBy.length ? -1 : 1);

        displayArray.map(answer => {
            answer.selectedByUser = answer.selectedBy.map(playerId => this.getPlayerData(players, playerId));
            answer.createdByUser = answer.createdBy.map(playerId => this.getPlayerData(players, playerId));
            answer.houseLie = answer.createdByUser[0].id === 'house';
            return answer;
        });

        displayArray.push(Object.assign({}, realAnswer, {
            truth: true,
            selectedByUser: realAnswer.selectedBy.map(playerId => this.getPlayerData(players, playerId)),
            createdByUser: [{ name: '', picture: 'the-truth.png' }],
        }));

        return displayArray;
    }

    getPlayerData(players: Player[], playerId: string) {
        const houseObj = { id: 'house', name: 'Homegrown Bullshit', picture: 'homegrown-bullshit.png' };
        return players.find(player => player.id === playerId) || houseObj;
    }

}

// tslint:disable
// const gg = {
//     "name": "aanv",
//     "players": [
//         {
//             "id": "23123e3e-7c43-49bb-a870-b84773bb4c59",
//             "name": "Inon Rotem",
//             "picture": "avatar0.png",
//             "score": 2700
//         },
//         {
//             "id": "69ad630f-aece-4332-9eab-6ffd128db3cd",
//             "name": "Yonatan Nis",
//             "picture": "avatar1.png",
//             "score": 400
//         },
//         {
//             "id": "4ad45377-7688-4bc2-8ae4-7c5d48b33532",
//             "name": "Sharon Adler",
//             "picture": "avatar2.png",
//             "score": 800
//         },
//         {
//             "id": "bbf69126-a235-46bd-85e3-dff03112aba4",
//             "name": "May Mazuz",
//             "picture": "avatar3.png",
//             "score": 3200
//         }
//     ],
//     "currentQuestion": {
//         "rtl": true,
//         "citation": "https://en.wikipedia.org/wiki/Samburu_people",
//         "fakeAnswers": [
//             {
//                 "createdBy": [
//                     "house"
//                 ],
//                 "points": -800,
//                 "selectedBy": [
//                     "4ad45377-7688-4bc2-8ae4-7c5d48b33532",
//                     "69ad630f-aece-4332-9eab-6ffd128db3cd"
//                 ],
//                 "text": "אני רעב"
//             },
//             {
//                 "createdBy": [
//                     "69ad630f-aece-4332-9eab-6ffd128db3cd"
//                 ],
//                 "points": 800,
//                 "selectedBy": [
//                     "23123e3e-7c43-49bb-a870-b84773bb4c59"
//                 ],
//                 "text": "מי צריך נעליים?"
//             },
//             {
//                 "createdBy": [
//                     "house"
//                 ],
//                 "points": 0,
//                 "selectedBy": [],
//                 "text": "מי אתה?"
//             },
//             {
//                 "createdBy": [
//                     "house"
//                 ],
//                 "points": 0,
//                 "selectedBy": [],
//                 "text": "מוות לקפיטליזם"
//             }
//         ],
//         "id": "01bb5e64-ceef-4716-bc0d-52a30044c3a9",
//         "lang": "he-IL",
//         "questionText": "בפרסומת של נייק בשנת 1980 המילים שנאמרו על ידי בן שבט קנייתי תורגמו כ- \"Just Do It\". עם זאת, האנתרופולוג האמריקאי Lee Cronk טען כי מה שהקנייתי באמת התכוון להגיד זה \" $BLANK$ \".",
//         "realAnswer": {
//             "createdBy": [
//                 "house"
//             ],
//             "points": 1000,
//             "selectedBy": [
//                 "bbf69126-a235-46bd-85e3-dff03112aba4"
//             ],
//             "text": "לא רוצה את אלה. תביאו לי נעליים גדולות."
//         },
//         "startedAt": {
//             "$reql_type$": "TIME",
//             "epoch_time": 1488795223.373,
//             "timezone": "+00:00"
//         },
//         "state": 5
//     }
// };
