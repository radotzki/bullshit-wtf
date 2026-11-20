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
import { pairStrings, PairStrings, decoyView, DecoyView, friendName, lieNudge } from './../pair-strings';

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
    // "Pick a decoy" (two-player games in the test): this player's offers are `ideas`, the chip they
    // tapped, and the friend's name for the chooser's lines.
    pair = false;
    pairWords: PairStrings = pairStrings('en');
    friend = '';
    private chosenDecoy: string = null;
    // The player tapped a chip themself (not the one-offer default): until they type a lie, say so.
    private decoyTapped = false;

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
            this.apiService.didAnswerSubmitted(this.pin).then(submitted => this.questionSubmitted = submitted);
            this.loadHelper();
        }
    }

    private useLocale(locale: string) {
        this.rtl = locale === 'he';
        this.t = gameStrings(locale);
        this.aboutWords = aboutStrings(locale);
        this.missedLine = aboutMissedLine(this.aboutWords, this.missedView);
        this.pairWords = pairStrings(locale);
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

    /**
     * Round 1 of a coach game: the hint line, the placeholder and this player's ready-made lies.
     * A pair game: the same lies on every question, as the decoy offers, and the friend's name.
     */
    private async loadHelper() {
        try {
            const [info, pair] = await Promise.all([
                this.apiService.getLieHelperInfo(this.pin),
                this.apiService.isPairGame(this.pin),
            ]);
            this.helperInfo = info;
            this.updateHelper();

            if ((info.coach && info.roundIndex === 0) || pair) {
                if (pair) {
                    const players = await this.apiService.getPlayers(this.pin).catch(() => null);
                    const user = this.sessionService.user;
                    this.friend = friendName(players, user && user.pid);
                }
                this.ideas = await this.apiService.getMyIdeas(this.pin);
                this.pair = pair;
                this.updateHelper();
            }
        } catch (e) {
            // The screen works without the helper.
        }
    }

    /** The decoy chooser (pair games only), or null when it hides. Follows what is in the box. */
    get decoy(): DecoyView {
        return this.pair && !this.aboutName ? decoyView(this.ideas, this.answer, this.chosenDecoy) : null;
    }

    /** The friend's name in the chooser's lines. */
    get friendLabel(): string {
        return this.friend || this.pairWords.friend;
    }

    /** A chip tapped: the decoy is chosen, and the lie box gets the focus, since SEND still needs a lie. */
    chooseDecoy(offer: string, lieBox?: HTMLInputElement) {
        this.chosenDecoy = offer;
        this.decoyTapped = true;
        if (lieBox && lieNudge(this.answer, true)) {
            lieBox.focus();
        }
    }

    /** The line under the lie box after a chip was tapped with the box still empty (pair games only). */
    get showLieNudge(): boolean {
        return !!this.decoy && lieNudge(this.answer, this.decoyTapped);
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

    ngOnDestroy() {
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

        // A pair game: the chosen decoy goes with the lie. None chosen: the server picks one of the offers.
        const decoy = this.decoy;
        this.apiService.answer(this.pin, this.answer.trim(), decoy && decoy.chosen ? decoy.chosen : undefined)
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
