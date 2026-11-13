import { GameService } from './services/game.service';
import { SentryModule } from './sentry/sentry.module';
import { ApiService } from './services/api.service';
import { StorageService } from './services/storage.service';
import { SessionService } from './services/session.service';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';

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
import { QrCodeComponent } from './components/qr-code/qr-code.component';
import { InviteComponent } from './components/invite/invite.component';
import { ShareResultsComponent } from './components/share-results/share-results.component';
import { HostAskComponent } from './components/host-ask/host-ask.component';
import { InviteGroupComponent } from './components/invite-group/invite-group.component';
import { WaitingRowComponent } from './components/waiting-row/waiting-row.component';
import { ShareService } from './services/share.service';
import { ResultsCardService } from './services/results-card.service';
import { CrewService } from './services/crew.service';
import { SoundService } from './services/sound.service';
import { CrewComponent } from './pages/crew/crew.component';
import { StepComponent } from './pages/step/step.component';

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
        QrCodeComponent,
        InviteComponent,
        ShareResultsComponent,
        HostAskComponent,
        InviteGroupComponent,
        WaitingRowComponent,
        CrewComponent,
        StepComponent,
    ],
    imports: [
        BrowserModule,
        FormsModule,
        AppRoutingModule,
        SentryModule,
    ],
    providers: [
        provideHttpClient(),
        SessionService,
        StorageService,
        ApiService,
        GameService,
        ShareService,
        ResultsCardService,
        CrewService,
        SoundService,
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
