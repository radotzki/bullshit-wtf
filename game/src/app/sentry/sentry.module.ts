import { environment } from './../../environments/environment';
import * as Raven from 'raven-js';
import { NgModule, ErrorHandler } from '@angular/core';

Raven.config(environment.sentry).install();

export class RavenErrorHandler implements ErrorHandler {
    handleError(err: any): void {
        Raven.captureException(err.originalError);
    }
}

@NgModule({
    providers: [{ provide: ErrorHandler, useClass: RavenErrorHandler }],
})
export class SentryModule { }
