import { ScoreBoardFinalComponent } from './../pages/score-board-final/score-board-final.component';
import { ScoreBoardComponent } from './../pages/score-board/score-board.component';
import { RevealTheTruthComponent } from './../pages/reveal-the-truth/reveal-the-truth.component';
import { ShowAnswersComponent } from './../pages/show-answers/show-answers.component';
import { ShowQuestionComponent } from './../pages/show-question/show-question.component';
import { RoundIntroComponent } from './../pages/round-intro/round-intro.component';
import { GameStagingComponent } from './../pages/game-staging/game-staging.component';
import { PresentGameComponent } from './../pages/present-game/present-game.component';
import { DesktopLandingComponent } from '../pages/landing/desktop-landing/desktop-landing.component';
import { MobileLandingComponent } from '../pages/landing/mobile-landing/mobile-landing.component';
import { LandingComponent } from '../pages/landing/landing.component';
import { JoinGameComponent } from '../pages/join-game/join-game.component';
import { CreateGameComponent } from '../pages/create-game/create-game.component';
import { SessionService } from '../services/session.service';

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    { path: '', component: LandingComponent },
    { path: 'm', component: MobileLandingComponent },
    { path: 'd', component: DesktopLandingComponent },
    { path: 'present-game', component: PresentGameComponent },
    { path: 'create-game', component: CreateGameComponent },
    { path: 'join-game', component: JoinGameComponent },
    { path: 'game-staging/:pin', component: GameStagingComponent, canActivate: [SessionService] },
    { path: 'round-intro/:pin/:number', component: RoundIntroComponent, canActivate: [SessionService] },
    { path: 'show-question/:pin', component: ShowQuestionComponent, canActivate: [SessionService] },
    { path: 'show-answers/:pin', component: ShowAnswersComponent, canActivate: [SessionService] },
    { path: 'reveal-the-truth/:pin', component: RevealTheTruthComponent, canActivate: [SessionService] },
    { path: 'score-board/:pin', component: ScoreBoardComponent, canActivate: [SessionService] },
    { path: 'score-board-final/:pin', component: ScoreBoardFinalComponent, canActivate: [SessionService] },
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule]
})
export class AppRoutingModule { }
