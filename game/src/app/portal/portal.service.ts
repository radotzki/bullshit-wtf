import { Injectable, NgZone } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Howler } from 'howler';
import { ApiService } from '../services/api.service';
import { markHosted, markVisit, preferredLocale, setPreferredLocale } from '../services/join-source';
import { reportError } from '../sentry/sentry.module';
import { chosenPack, seasonalPack } from '../game-model';
import {
    PORTAL_TAG, QuickStart, announcePortalLocale, autoJoinDue, blockedLink, gameplayFor, inPortal, invitePin, portalCampaign,
    portalLocale, roomFor, portalUsername, setHappyTime, setInviteMaker, setPortalGameLink, setPortalUsername, soloStartDue,
} from './portal';
import { PORTAL_CSS } from './portal-style';
import { clearSoloStartFailure, soloStartFailed } from '../services/solo-run';

/** CrazyGames' HTML5 SDK, v3 (https://docs.crazygames.com/sdk/intro/). Loaded on the portal path only. */
export const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
/** The SDK must not hold the game back: past this, the portal goes on without it. */
const SDK_WAIT_MS = 8000;
const campaignKey = 'BS_CAMPAIGN';

/**
 * The CrazyGames version's runtime (see portal.ts). Started once at app start, and only on the portal
 * path: it marks the page, tags its games, guards its links, loads the SDK and, once it is ready,
 * tells CrazyGames about loading, gameplay and rooms, makes invite links, and opens the game an
 * invite link or Instant Multiplayer asks for.
 */
@Injectable({ providedIn: 'root' })
export class PortalService {
    private sdk: any = null;
    private started = false;
    private playing: boolean | null = null;
    private room = '';
    /** The game the home's two starts (or Instant Multiplayer) just made (portal.ts, QuickStart). */
    private quick: QuickStart | null = null;

    constructor(private router: Router, private zone: NgZone, private api: ApiService) { }

    start() {
        if (this.started || !inPortal()) {
            return;
        }
        this.started = true;
        try {
            document.documentElement.classList.add('bs-portal');
            const style = document.createElement('style');
            style.textContent = PORTAL_CSS;
            document.head.appendChild(style);
        } catch (e) { }
        this.keepCampaign();
        this.guardLinks();
        // The taste played alone starts on its lobby, with or without the SDK.
        this.router.events.subscribe(e => {
            if (e instanceof NavigationEnd) {
                this.startSoloIfDue(e.urlAfterRedirects);
            }
        });
        try {
            setPreferredLocale(portalLocale(null, window.location.pathname));
        } catch (e) { }
        // The SDK loads beside the app; the app never waits for it.
        this.loadSdk().then(sdk => this.ready(sdk)).catch(err => reportError(err, 'portalSdk', {}));
    }

    /** Every game this tab creates carries the portal's tag (a play-test tab stays a test). */
    private keepCampaign() {
        try {
            const s = window.sessionStorage;
            s.setItem(campaignKey, portalCampaign(s.getItem(campaignKey), window.location.search));
        } catch (e) { }
    }

    /** No link out to the playable site: a tap on one does nothing (portal.ts, blockedLink). */
    private guardLinks() {
        document.addEventListener('click', (e: MouseEvent) => {
            let el = e.target as any;
            while (el && el.tagName !== 'A') {
                el = el.parentElement;
            }
            if (el && el.getAttribute && blockedLink(el.getAttribute('href'), window.location.href)) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    }

    private loadSdk(): Promise<any> {
        const w = window as any;
        if (w.CrazyGames && w.CrazyGames.SDK) {
            return Promise.resolve(w.CrazyGames.SDK);
        }
        return new Promise(resolve => {
            const script = document.createElement('script');
            const timer = setTimeout(() => resolve(null), SDK_WAIT_MS);
            script.src = SDK_URL;
            script.async = true;
            script.onload = () => {
                clearTimeout(timer);
                resolve(w.CrazyGames && w.CrazyGames.SDK ? w.CrazyGames.SDK : null);
            };
            script.onerror = () => {
                clearTimeout(timer);
                resolve(null);
            };
            document.head.appendChild(script);
        });
    }

    private async ready(sdk: any) {
        if (!sdk) {
            return;
        }
        try {
            await sdk.init();
        } catch (e) {
            reportError(e, 'portalSdkInit', {});
            return;
        }
        // 'disabled' (not on CrazyGames, and not local): every call would throw.
        if (sdk.environment === 'disabled') {
            return;
        }
        this.sdk = sdk;
        this.call(() => sdk.game.loadingStart());

        const user = sdk.user || {};
        const info = user.systemInfo || {};
        const locale = portalLocale(info.locale, window.location.pathname);
        setPreferredLocale(locale);
        this.zone.run(() => announcePortalLocale(locale));

        try {
            const me = user.getUser ? await user.getUser() : null;
            setPortalUsername(me && me.username);
        } catch (e) { }

        this.applyMute();
        this.call(() => sdk.game.addSettingsChangeListener(() => this.applyMute()));

        // A solo run's new best is a happy moment (portal.ts, happyTime).
        setHappyTime(() => this.call(() => sdk.game.happytime()));
        // Invite links come from CrazyGames; the lobby's QR, WhatsApp, share and copy read them.
        setInviteMaker(pin => sdk.game.inviteLink({ roomId: pin }), () => this.zone.run(() => { }));
        try {
            const link = await sdk.game.inviteLink({});
            setPortalGameLink(typeof link === 'string' ? link : '');
        } catch (e) { }

        this.router.events.subscribe(e => {
            if (e instanceof NavigationEnd) {
                this.onRoute(e.urlAfterRedirects);
            }
        });
        this.onRoute(this.router.url);

        // A friend's invite link opens that game's nickname step; Instant Multiplayer opens a new lobby.
        this.call(() => sdk.game.addJoinRoomListener((params: any) => this.zone.run(() => this.joinFrom(params))));
        const invited = this.joinFrom(sdk.game.inviteParams || {
            roomId: sdk.game.getInviteParam ? sdk.game.getInviteParam('roomId') : null,
        });
        if (!invited && sdk.game.isInstantMultiplayer) {
            // Instant Multiplayer: a new private game with the default settings, its lobby at once.
            await this.zone.run(() => this.quickGame(locale, false));
        }
        this.call(() => sdk.game.loadingStop());
    }

    /** Opens the join step of the game in an invite's parameters; false when there is none. */
    private joinFrom(params: any): boolean {
        const pin = invitePin(params && params.roomId);
        if (!pin) {
            return false;
        }
        this.router.navigate(['/join-game', pin], { queryParams: { via: 'link' } });
        return true;
    }

    /**
     * A new game with the default settings (5 questions, the pack in season, as the create page
     * offers), for the portal's home and Instant Multiplayer. With the player's CrazyGames username
     * known, the join step sends it at once, so the player lands in the lobby with the invite link
     * (prefillNickname); without one, they type a nickname first. `solo`: the solo run, started as
     * soon as the player is in the lobby (startSoloIfDue). Resolves false if no game
     * could be made.
     */
    async quickGame(locale: string, solo: boolean): Promise<boolean> {
        try {
            const campaign = (() => {
                try {
                    return window.sessionStorage.getItem(campaignKey) || PORTAL_TAG;
                } catch (e) {
                    return PORTAL_TAG;
                }
            })();
            const pack = chosenPack(false, true, seasonalPack(Date.now(), locale) || null);
            const { pin } = await this.api.createGame(locale, 5, pack, campaign);
            markHosted(pin);
            markVisit('create');
            this.quick = { pin: pin.toUpperCase(), solo };
            // The nickname step follows the game's language, as the create page sends it.
            this.router.navigate(['/join-game', pin], { queryParams: locale !== preferredLocale() ? { lang: locale } : {} });
            return true;
        } catch (e) {
            reportError(e, solo ? 'portalSolo' : 'portalQuick', {});
            return false;
        }
    }

    /**
     * "Try it alone": START on its lobby, once, as a solo run (SoloRun in game-model): questions until
     * the player is fooled three times. If START fails, the lobby says so and shows its button
     * (soloStartFailed in services/solo-run.ts).
     */
    private startSoloIfDue(url: string) {
        const quick = this.quick;
        if (!soloStartDue(quick, url)) {
            return;
        }
        this.quick = null;
        clearSoloStartFailure();
        this.api.logShare('invite', 'solo-run-start', { locale: preferredLocale() });
        this.api.startGame(quick.pin, true).catch(err => {
            reportError(err, 'portalSoloStart', { pin: quick.pin });
            this.zone.run(() => soloStartFailed(quick.pin));
        });
    }

    private onRoute(url: string) {
        const sdk = this.sdk;
        if (!sdk) {
            return;
        }
        const play = gameplayFor(url) === 'play';
        if (play !== this.playing) {
            this.playing = play;
            this.call(() => play ? sdk.game.gameplayStart() : sdk.game.gameplayStop());
        }
        if (/^\/join-game\/[A-Za-z]+/.test(url)) {
            const send = autoJoinDue(this.quick, url, portalUsername());
            if (send) {
                this.quick = Object.assign({}, this.quick, { sent: true });
            }
            this.prefillNickname(send);
        }
        const room = roomFor(url);
        if (room) {
            const key = room.pin + (room.joinable ? '+' : '-');
            if (key !== this.room) {
                this.room = key;
                this.call(() => sdk.game.updateRoom({ roomId: room.pin, isJoinable: room.joinable, inviteParams: { roomId: room.pin } }));
            }
        } else if (this.room) {
            this.room = '';
            this.call(() => sdk.game.leftRoom());
        }
    }

    /**
     * CrazyGames asks that its usernames show in the game: the nickname box starts with the player's
     * CrazyGames username (they can still change it). Typed into the box as a player would, so the
     * join page itself needs no change.
     */
    private prefillNickname(send = false) {
        const name = portalUsername();
        if (!name) {
            return;
        }
        let tries = 0;
        const fill = () => {
            const box = document.querySelector('input[name="nickname"]') as HTMLInputElement;
            if (!box) {
                if (++tries < 20) {
                    setTimeout(fill, 100);
                }
                return;
            }
            if (!box.value) {
                box.value = name;
                box.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // A game this player just made from the home: in with their username, no step between.
            if (send && box.value) {
                const join = box.form && box.form.querySelector('button[type="submit"]') as HTMLButtonElement;
                if (join) {
                    setTimeout(() => this.zone.run(() => join.click()), 0);
                }
            }
        };
        setTimeout(fill, 0);
    }

    /** CrazyGames' mute setting wins over the game's own sound. */
    private applyMute() {
        try {
            const settings = this.sdk && this.sdk.game && this.sdk.game.settings;
            Howler.mute(!!(settings && settings.muteAudio));
        } catch (e) { }
    }

    /** An SDK call never breaks the game (they throw outside CrazyGames, some return promises). */
    private call(f: () => any) {
        try {
            const r = f();
            if (r && typeof r.catch === 'function') {
                r.catch(() => { });
            }
        } catch (e) { }
    }
}
