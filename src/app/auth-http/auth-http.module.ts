import { SessionService } from './../services/session.service';
import { StorageService } from './../services/storage.service';
import { NgModule } from '@angular/core';
import { Http, RequestOptions } from '@angular/http';
import { AuthHttp, AuthConfig } from 'angular2-jwt';

const storage = new StorageService();
const session = new SessionService(null, storage);

function authHttpServiceFactory(http: Http, options: RequestOptions) {
    return new AuthHttp(new AuthConfig({ tokenGetter: (() => session.user.token) }), http, options);
}

@NgModule({
    providers: [
        {
            provide: AuthHttp,
            useFactory: authHttpServiceFactory,
            deps: [Http, RequestOptions]
        }
    ]
})
export class AuthHttpModule { }
