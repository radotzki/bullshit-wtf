import { Injectable, NgZone } from '@angular/core';
import { reportError } from '../sentry/sentry.module';
import { PORTAL_CSS } from './portal-style';
import { discordClientId, inDiscordActivity, launchSearch } from './portal';
import {
    DISCORD_CSS, DiscordSdkLike, READY_WAIT_MS, canShareMoment, discordLink, launchFrom, onDiscordChange, openOutside, setDiscordSdk,
} from './discord';

/**
 * The Discord Activity's runtime (see discord.ts). Started once at app start, and only when the
 * switch in portal.ts says Discord: it marks the page, hides what can't work in Discord, sends links
 * that leave the game to the player's browser, and starts Discord's Embedded App SDK, which is loaded
 * on its own (a separate file of the build) so the site's visitors never download it.
 *
 * `ready` settles once the SDK is ready, or has failed, or READY_WAIT_MS has passed: the shell's home
 * waits for it before it asks for the call's game, and goes on without the SDK when it isn't there.
 */
@Injectable({ providedIn: 'root' })
export class DiscordService {
    private started = false;
    private settle: (ok: boolean) => void = () => { };
    readonly ready: Promise<boolean> = new Promise(resolve => this.settle = resolve);

    constructor(private zone: NgZone) { }

    start() {
        if (this.started || !inDiscordActivity()) {
            return;
        }
        this.started = true;
        try {
            document.documentElement.classList.add('bs-portal', 'bs-discord');
            const style = document.createElement('style');
            style.textContent = PORTAL_CSS + DISCORD_CSS;
            document.head.appendChild(style);
            onDiscordChange(() => document.documentElement.classList.toggle('bs-discord-share', canShareMoment()));
        } catch (e) { }
        this.guardLinks();
        // The SDK loads beside the app; the app never waits for it longer than READY_WAIT_MS.
        const timer = setTimeout(() => this.settle(false), READY_WAIT_MS);
        this.zone.runOutsideAngular(() => this.startSdk())
            .then(sdk => {
                clearTimeout(timer);
                this.zone.run(() => setDiscordSdk(sdk));
                this.settle(!!sdk);
            }, err => {
                clearTimeout(timer);
                reportError(err, 'discordSdk', {});
                this.settle(false);
            });
    }

    /** The call's instance id: the SDK's, from the address Discord opened the Activity at. */
    instanceId(): string {
        try {
            return launchFrom(launchSearch()).instanceId;
        } catch (e) {
            return '';
        }
    }

    private async startSdk(): Promise<DiscordSdkLike | null> {
        const { DiscordSDK } = await import('@discord/embedded-app-sdk');
        // The SDK reads Discord's launch parameters from the address when it starts, but by then the hash
        // router has taken them off it: it reads the ones the page loaded with (portal.ts, launchSearch).
        class LaunchedSDK extends DiscordSDK {
            _getSearch() {
                return launchSearch();
            }
        }
        // The SDK forwards console lines to Discord's own console by default: the game's stay its own.
        const sdk = new LaunchedSDK(discordClientId(), { disableConsoleLogOverride: true });
        await sdk.ready();
        return sdk as any;
    }

    /**
     * A link that would leave the game (how to play, a page of the site) opens in the player's browser
     * through Discord, which asks the player first: inside Discord's frame it could only replace the
     * game, or be refused. In-app routes stay as they are (discord.ts, discordLink).
     */
    private guardLinks() {
        document.addEventListener('click', (e: MouseEvent) => {
            let el = e.target as any;
            while (el && el.tagName !== 'A') {
                el = el.parentElement;
            }
            const out = el && el.getAttribute ? discordLink(el.getAttribute('href'), window.location.href) : null;
            if (out) {
                e.preventDefault();
                e.stopImmediatePropagation();
                openOutside(out);
            }
        }, true);
    }
}
