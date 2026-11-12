import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { preferredLocale, setPreferredLocale } from '../../services/join-source';
import { LearnStrings, learnStrings } from './learn-strings';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-learn',
    templateUrl: './learn.component.html',
    styleUrls: ['./learn.component.scss']
})
export class LearnComponent implements OnInit {
    // The page's words, in the visitor's language: decided the way the Create page decides it.
    t: LearnStrings = learnStrings('en');
    // Sent along to Create and Join only when this page's language came from its own address.
    langQuery: { lang?: string } = {};

    constructor(private route: ActivatedRoute) { }

    ngOnInit() {
        const params = this.route.snapshot.queryParams || {};
        this.setLocale(params.lang === 'he' || params.lang === 'en' ? params.lang : preferredLocale());
    }

    /** The same switch as the home menu's: it is kept for the menu and for new games too. */
    switchLanguage() {
        setPreferredLocale(this.t.switchTo);
        this.setLocale(this.t.switchTo);
    }

    private setLocale(locale: string) {
        this.t = learnStrings(locale);
        this.langQuery = this.t.lang !== preferredLocale() ? { lang: this.t.lang } : {};
    }
}
