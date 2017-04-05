import { environment } from './../../environments/environment';
import * as Raven from 'raven-js';
import { NgModule, ErrorHandler } from '@angular/core';

if (environment.production) {
    Raven
        .config('https://cbf5aaf3b4694fc2993289b77d2c7db6@sentry.io/144992')
        .install();
}

export class RavenErrorHandler implements ErrorHandler {
    handleError(err: any): void {
        Raven.captureException(err.originalError);
    }
}

@NgModule({
    providers: [{ provide: ErrorHandler, useClass: RavenErrorHandler }],
})
export class SentryModule { }
