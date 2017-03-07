import { ApiService } from './services/api.service';
import { StorageService } from './services/storage.service';
import { SessionService } from './services/session.service';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SigninComponent } from './pages/signin/signin.component';
import { ValidateTokenComponent } from './pages/validate-token/validate-token.component';
import { LandingComponent } from './pages/landing/landing.component';
import { MobileLandingComponent } from './pages/landing/mobile-landing/mobile-landing.component';
import { DesktopLandingComponent } from './pages/landing/desktop-landing/desktop-landing.component';
import { CreateGameComponent } from './pages/create-game/create-game.component';
import { JoinGameComponent } from './pages/join-game/join-game.component';

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
    ],
    imports: [
        BrowserModule,
        FormsModule,
        HttpModule,
        AppRoutingModule,
    ],
    providers: [
        SessionService,
        StorageService,
        ApiService,
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
