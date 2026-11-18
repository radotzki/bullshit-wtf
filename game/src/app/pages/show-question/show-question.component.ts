import { reportError } from './../../sentry/sentry.module';
import { Howl } from 'howler';
import { fadeOutAndUnload } from './../fade-out';
import { ApiService } from './../../services/api.service';
import { SessionService } from './../../services/session.service';
import { GameService, durations } from './../../services/game.service';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { GameState, aboutView, aboutMissedView } from '../../game-model';
import { SoundService } from './../../services/sound.service';
import { lieHelperView, nextIdea, LieHelperView } from './lie-helper';
import { gameStrings, GameStrings } from './../game-strings';
import { aboutStrings, AboutStrings, aboutMissedLine } from './../about-strings';
import { hostStrings, HostStrings, HostLieRow, hostLieRows } from './../host-strings';
import { Subscription } from 'rxjs';

@Component({
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-show-question',
    templateUrl: './show-question.component.html',
    styleUrls: ['./show-question.component.scss']
})
export class ShowQuestionComponent implements OnInit, OnDestroy {
    pin: string;
    question: string;
    presenter: boolean;
    loading: boolean;
    errorMsg: string;
    answer: string;
    questionSubmitted: boolean;
    enteredCorrectAnswer: boolean;
    rtl: boolean;
    t: GameStrings = gameStrings('en');
    duration: number;
    past: number;
    timer;
    sound: Howl;
    private phoneTickStopped = false;
    panic: boolean;
    // The round-1 lie helper (games with coach: true only).
    helper: LieHelperView = { hint: null, placeholder: null, button: null };
    private ideas: string[] = [];
    private ideasUsed = 0;
    private helperInfo: { coach: boolean; roundIndex: number; questionIndex: number; locale: string };
    // An About question (see aboutOf in game-model): whom it is about, and whether that is this phone's player.
    aboutName: string = null;
    aboutMe = false;
    aboutWords: AboutStrings = aboutStrings('en');
    // A bank question played in place of an About question that got no truth: the line saying why.
    missedLine: string = null;
    private missedView: { me: boolean; name: string } = null;
    // The host's look at the lies (host-strings.ts): only on the phone with the game's host key, once its own lie is in.
    host = false;
    h: HostStrings = hostStrings('en');
    /** null: closed; 'ask': the warning that the host's pick won't score; 'open': the list. */
    check: null | 'ask' | 'open' = null;
    lies: HostLieRow[] = [];
    checkBusy = false;
    checkError: string = null;
    private hiddenLies: { [id: string]: boolean } = {};
    private answersSubscription: Subscription;

    constructor(
        private activatedRoute: ActivatedRoute,
        private gameService: GameService,
        private sessionService: SessionService,
        private apiService: ApiService,
        private soundService: SoundService,
    ) { }

    ngOnInit() {
        this.pin = this.activatedRoute.snapshot.params['pin'];
        this.loadQuestion();
        this.useLocale(this.apiService.knownGameLocale(this.pin));
        this.apiService.getGameLocale(this.pin).then(locale => this.useLocale(locale), () => null);
        this.gameService.register(this.pin);
        this.presenter = !!this.sessionService.presenter;
        this.startTimer();
        this.playBackground();

        if (!this.presenter) {
            this.host = this.apiService.holdsHostKey(this.pin);
            this.apiService.didAnswerSubmitted(this.pin).then(submitted => this.questionSubmitted = submitted);
            this.loadHelper();
        }
    }

    private useLocale(locale: string) {
        this.rtl = locale === 'he';
        this.t = gameStrings(locale);
        this.aboutWords = aboutStrings(locale);
        this.h = hostStrings(locale);
        this.missedLine = aboutMissedLine(this.aboutWords, this.missedView);
    }

    /**
     * The question, and for an About question whom it is about, set in one go: the player it is about
     * never sees the writing form before the "about you" badge, however slow the network (an empty
     * answer typed there would be a lie where their truth belongs).
     */
    private loadQuestion() {
        this.apiService.getQuestionWithAbout(this.pin).then(({ question, about, missed, players }) => {
            const user = this.sessionService.user;
            const view = aboutView(about, players, user && user.pid, this.presenter);
            this.aboutMe = view.aboutMe;
            this.aboutName = view.aboutName;
            this.missedView = aboutMissedView(missed, players, user && user.pid, this.presenter);
            this.missedLine = aboutMissedLine(this.aboutWords, this.missedView);
            this.question = question;
        });
    }

    /** Round 1 of a coach game: the hint line, the placeholder and this player's ready-made lies. */
    private async loadHelper() {
        try {
            const info = await this.apiService.getLieHelperInfo(this.pin);
            this.helperInfo = info;
            this.updateHelper();

            if (info.coach && info.roundIndex === 0) {
                this.ideas = await this.apiService.getMyIdeas(this.pin);
                this.updateHelper();
            }
        } catch (e) {
            // The screen works without the helper.
        }
    }

    private updateHelper() {
        const i = this.helperInfo;
        if (i) {
            this.helper = lieHelperView(i.coach, i.roundIndex, i.questionIndex, i.locale, this.ideas, this.ideasUsed);
        }
    }

    giveMeALie() {
        const idea = nextIdea(this.ideas, this.ideasUsed);
        if (idea) {
            this.answer = idea;
            this.enteredCorrectAnswer = false;
            this.ideasUsed++;
            this.updateHelper();
        }
    }

    /** The host opens the lies, after the warning: the server now holds the answers for them (see host-controls.ts). */
    openLies() {
        if (this.checkBusy) {
            return;
        }
        this.checkBusy = true;
        this.checkError = null;
        this.apiService.hostLies(this.pin).then(r => {
            this.checkBusy = false;
            this.check = 'open';
            (r.lies || []).forEach(l => this.hiddenLies[l.id] = !!l.hidden);
            this.lies = r.lies || [];
            const me = this.sessionService.user && this.sessionService.user.pid;
            if (!this.answersSubscription) {
                this.answersSubscription = this.apiService.answersLive(this.pin)
                    .subscribe(answers => this.lies = hostLieRows(answers, me, this.hiddenLies));
            }
        }, err => this.checkFailed(err));
    }

    toggleLie(lie: HostLieRow) {
        if (this.checkBusy) {
            return;
        }
        this.checkBusy = true;
        this.checkError = null;
        this.apiService.hideLie(this.pin, lie.id, !lie.hidden).then(() => {
            this.checkBusy = false;
            this.hiddenLies[lie.id] = !lie.hidden;
            this.lies = this.lies.map(l => l.id === lie.id ? Object.assign({}, l, { hidden: !lie.hidden }) : l);
        }, err => this.checkFailed(err));
    }

    showAnswersNow() {
        if (this.checkBusy) {
            return;
        }
        this.checkBusy = true;
        this.apiService.showAnswersNow(this.pin).then(() => this.checkBusy = false, err => this.checkFailed(err));
    }

    private checkFailed(err: any) {
        this.checkBusy = false;
        if (err && err.code === 'TOO_LATE') {
            this.checkError = this.h.tooLate;
            return;
        }
        reportError(err, 'hostControl', { pin: this.pin });
        this.checkError = this.t.oops;
    }

    ngOnDestroy() {
        if (this.answersSubscription) {
            this.answersSubscription.unsubscribe();
        }
        this.stopMusic();
        this.phoneTickStopped = true;
        this.soundService.stop('time-warning');
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    submit() {
        this.loading = true;
        this.errorMsg = '';

        this.apiService.answer(this.pin, this.answer.trim())
            .then(() => {
                this.questionSubmitted = true;
                this.loading = false;
            })
            .catch(err => {
                this.loading = false;

                if (err && err.code === 'CORRECT_ANSWER') {
                    this.enteredCorrectAnswer = true;
                } else {
                    reportError(err, 'answer', { pin: this.pin });
                    this.errorMsg = this.t.oops;
                }
            });
    }

    startTimer() {
        this.apiService.getGameTimestamp(this.pin).then(({ timestamp, now }) => {
            this.duration = durations[GameState.ShowQuestion];
            this.past = now - timestamp;
            this.timer = setInterval(() => {
                this.past += 1000;

                if (!this.panic && this.duration - this.past < 5000) {
                    this.playTimeWarning();
                    this.panic = true;
                }
            }, 1000);
        }).catch(err => reportError(err, 'startTimer', { pin: this.pin }));
    }

    playBackground() {
        this.playMusic(['/assets/sounds/during-game.mp3']);
    }

    playTimeWarning() {
        this.playMusic(['/assets/sounds/time-warning.mp3']);

        // Phones tick too in a staged-reveal game with no big screen (unless muted).
        if (!this.presenter) {
            this.apiService.phoneSound(this.pin).then(sound => {
                if (sound && !this.phoneTickStopped) {
                    this.soundService.play('time-warning');
                }
            });
        }
    }

    playMusic(src: string[]) {
        if (this.presenter) {
            this.stopMusic();
            this.sound = new Howl({ src, autoplay: true });
        }
    }

    stopMusic() {
        if (this.sound) {
            fadeOutAndUnload(this.sound);
        }
    }

}
