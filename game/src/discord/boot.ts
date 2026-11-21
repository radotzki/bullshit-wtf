/**
 * The first code of the page (the first entry of the polyfills in angular.json, before zone.js and
 * before the app's main bundle). Inside Discord it sends every request through Discord's proxy
 * (proxy.ts) and marks the page with window.bsDiscordProxy, which api.service.ts reads to keep the live
 * database on WebSockets. Anywhere else, on bullshit.wtf above all, it does nothing.
 */
import { inDiscord, patchForDiscordProxy } from './proxy';

if (typeof window !== 'undefined' && inDiscord(window.location.hostname)) {
    (window as any).bsDiscordProxy = patchForDiscordProxy(window);
    // The build loads the game's stylesheet as media="print" and an inline script at the end of
    // index.html turns it on (Angular's critical-CSS step, data-beasties-media). Discord's content
    // policy may refuse inline scripts; this file is not inline, so it turns the stylesheet on too.
    // It runs after the page is parsed (the polyfills are a module), as the inline script does.
    window.document.querySelectorAll('link[data-beasties-media]').forEach((l: HTMLLinkElement) => {
        l.media = l.getAttribute('data-beasties-media');
        l.removeAttribute('data-beasties-media');
    });
}
