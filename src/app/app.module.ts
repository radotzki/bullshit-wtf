import { GameService } from './services/game.service';
import { SentryModule } from './sentry/sentry.module';
import { AuthHttpModule } from './auth-http/auth-http.module';
import { ApiService } from './services/api.service';
import { StorageService } from './services/storage.service';
import { SessionService } from './services/session.service';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';

import { AppRoutingModule } from './app-routing/app-routing.module';
import { AppComponent } from './app.component';
import { SigninComponent } from './pages/signin/signin.component';
import { ValidateTokenComponent } from './pages/validate-token/validate-token.component';
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

@NgModule({
    declarations: [
        AppComponent,
        SigninComponent,
        ValidateTokenComponent,
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
    ],
    imports: [
        BrowserModule,
        FormsModule,
        HttpModule,
        AppRoutingModule,
        AuthHttpModule,
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
