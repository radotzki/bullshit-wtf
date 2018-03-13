import { GameService } from './services/game.service';
import { SentryModule } from './sentry/sentry.module';
import { ApiService } from './services/api.service';
import { StorageService } from './services/storage.service';
import { SessionService } from './services/session.service';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';

import { AppRoutingModule } from './app-routing/app-routing.module';
import { AppComponent } from './app.component';
import { LandingComponent } from './pages/landing/landing.component';
import { MobileLandingComponent } from './pages/landing/mobile-landing/mobile-landing.component';
import { DesktopLandingComponent } from './pages/landing/desktop-landing/desktop-landing.component';
import { CreateGameComponent } from './pages/create-game/create-game.component';
import { JoinGameComponent } from './pages/join-game/join-game.component';
import { PresentGameComponent } from './pages/present-game/present-game.component';
import { GameStagingComponent } from './pages/game-staging/game-staging.component';
import { GameHeaderComponent } from './components/game-header/game-header.component';
import { GameFooterComponent } from './components/game-footer/game-footer.component';
import { RoundIntroComponent } from './pages/round-intro/round-intro.component';
import { ShowQuestionComponent } from './pages/show-question/show-question.component';
import { ShowAnswersComponent } from './pages/show-answers/show-answers.component';
import { BsQuestionPipe } from './pipes/bs-question.pipe';
import { RevealTheTruthComponent } from './pages/reveal-the-truth/reveal-the-truth.component';
import { ScoreBoardComponent } from './pages/score-board/score-board.component';
import { ScoreBoardFinalComponent } from './pages/score-board-final/score-board-final.component';
import { BsPointsPipe } from './pipes/bs-points.pipe';
import { AutofocusDirective } from './directives/autofocus.directive';
import { LearnComponent } from './pages/learn/learn.component';

@NgModule({
    declarations: [
        AppComponent,
        MobileLandingComponent,
        DesktopLandingComponent,
        CreateGameComponent,
        JoinGameComponent,
        LandingComponent,
        PresentGameComponent,
        GameStagingComponent,
        GameHeaderComponent,
        GameFooterComponent,
        RoundIntroComponent,
        ShowQuestionComponent,
        ShowAnswersComponent,
        BsQuestionPipe,
        RevealTheTruthComponent,
        ScoreBoardComponent,
        ScoreBoardFinalComponent,
        BsPointsPipe,
        AutofocusDirective,
        LearnComponent,
    ],
    imports: [
        BrowserModule,
        FormsModule,
        HttpModule,
        AppRoutingModule,
        SentryModule,
    ],
    providers: [
        SessionService,
        StorageService,
        ApiService,
        GameService,
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
