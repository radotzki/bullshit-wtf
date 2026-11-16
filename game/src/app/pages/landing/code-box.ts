/**
 * The code box at the top of the phone home and the computer home: "Got a code? [ ____ ] Join".
 * One object for both pages, kept free of Angular so it can be tested in Node.
 *
 * Join asks the server whether the PIN is a game (the same check as the PIN page), then opens the
 * PIN's join page on the nickname, tagged ?via=home. The database and sign-in start only on that
 * press: a visitor who never types a code loads nothing more than before.
 */
import { cleanCode, codeBoxOutcome, codeJoinRoute } from './front-door';

export interface CodeBoxDeps {
    /** The server's PIN check (ApiService.validateGameName): rejects with { code, message }. */
    validate: (pin: string) => Promise<any>;
    /** Opens the join page (Router.navigate). */
    navigate: (path: string[], query: { [key: string]: string }) => any;
    /** The page's language now ('he' or 'en'). */
    locale: () => string;
    /**
     * The words for a failed PIN (pinError in join-strings.ts), given what was typed before cleaning,
     * and for an empty box.
     */
    errorText: (code: string, message: string, typed: string) => string;
    emptyText: () => string;
}

export class CodeBox {
    /** What is in the box. */
    code = '';
    /** Said under the box: a wrong PIN, a full game, or nothing typed. */
    error = '';
    /** The PIN check is on its way: the button waits, and a second press does nothing. */
    busy = false;

    constructor(private deps: CodeBoxDeps) { }

    async submit(): Promise<void> {
        if (this.busy) {
            return;
        }
        const typed = this.code;
        const pin = cleanCode(typed);
        if (!pin) {
            this.error = this.deps.emptyText();
            return;
        }
        this.error = '';
        this.busy = true;
        let failure: any = null;
        try {
            await this.deps.validate(pin);
        } catch (err) {
            failure = err || {};
        }
        if (failure && codeBoxOutcome(failure.code) === 'stay') {
            this.busy = false;
            this.error = this.deps.errorText(failure.code, failure.message, typed);
            return;
        }
        const route = codeJoinRoute(pin, this.deps.locale());
        try {
            await this.deps.navigate(route.path, route.query);
        } finally {
            this.busy = false;
        }
    }
}
