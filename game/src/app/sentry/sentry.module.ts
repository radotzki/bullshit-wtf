import { environment } from './../../environments/environment';
import * as Raven from 'raven-js';
import { NgModule, ErrorHandler } from '@angular/core';

Raven.config(environment.sentry, {
    environment: environment.production ? 'production' : 'development',
}).install();

function describe(value: any): string {
    try {
        return JSON.stringify(value);
    } catch (e) {
        return String(value);
    }
}

/**
 * Turn anything that was thrown or rejected into a real Error with a readable message.
 * Sentry shows "undefined" or "[object Object]" when it is given anything else.
 */
export function toError(err: any): Error {
    if (err instanceof Error) {
        return err;
    }

    if (err === undefined || err === null) {
        return new Error(`Empty error (${err})`);
    }

    if (typeof err === 'string') {
        return new Error(err);
    }

    const message = err.message || err.code || `Non-Error value: ${describe(err)}`;
    const error = new Error(String(message));

    if (err.code) {
        error.name = String(err.code);
    }

    return error;
}

/** Report an error to Sentry. `where` names the action that failed, e.g. "join". */
export function reportError(err: any, where?: string, extra?: { [key: string]: any }) {
    const error = toError(err);
    const details: { [key: string]: any } = Object.assign({}, extra);

    if (err && typeof err === 'object' && !(err instanceof Error)) {
        details.original = describe(err);
    }

    if (err && err.code) {
        details.code = err.code;
    }

    if (err && err.status !== undefined) {
        details.status = err.status;
    }

    Raven.captureException(error, {
        tags: where ? { where } : undefined,
        extra: details,
    });
}

export function setSentryUser(user: { id?: string, username?: string }) {
    Raven.setUserContext(user);
}

export class RavenErrorHandler implements ErrorHandler {
    handleError(err: any): void {
        // Angular wraps some errors; promise rejections carry the cause in `rejection`.
        const cause = (err && (err.originalError || err.rejection)) || err;
        reportError(cause, 'unhandled');
        console.error(err);
    }
}

@NgModule({
    providers: [{ provide: ErrorHandler, useClass: RavenErrorHandler }],
})
export class SentryModule { }
