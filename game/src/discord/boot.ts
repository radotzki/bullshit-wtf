/**
 * The first code of the page (the first entry of the polyfills in angular.json, before zone.js and
 * before the app's main bundle). Inside Discord it sends every request through Discord's proxy
 * (proxy.ts) and marks the page with window.bsDiscordProxy, which api.service.ts reads to keep the live
 * database on WebSockets. Anywhere else, on bullshit.wtf above all, it does nothing.
 */
import { inDiscord, patchForDiscordProxy } from './proxy';

if (typeof window !== 'undefined' && inDiscord(window.location.hostname)) {
    const doc = window.document;
    (window as any).bsDiscordProxy = patchForDiscordProxy(window);
    // For the styles that differ inside Discord (styles/arcade-form.scss: the background photo from the
    // game's own files, since the content policy refuses images from other sites).
    doc.documentElement.setAttribute('data-bs-discord', '');
    // The build loads the game's stylesheet as media="print" and an inline script at the end of
    // index.html turns it on (Angular's critical-CSS step, data-beasties-media); the icons' stylesheet
    // (data-bs-later) is turned on by an inline onload. Discord's content policy may refuse both; this
    // file is not inline, so it turns them on too. It runs after the page is parsed (the polyfills are a
    // module), as the inline script does.
    doc.querySelectorAll('link[data-beasties-media]').forEach((l: HTMLLinkElement) => {
        l.media = l.getAttribute('data-beasties-media');
        l.removeAttribute('data-beasties-media');
    });
    doc.querySelectorAll('link[data-bs-later]').forEach((l: HTMLLinkElement) => {
        l.media = 'all';
    });
    // The visit beacon is an inline script in index.html, which the content policy refuses: then it has
    // not set window.bsVisit, and the same script comes from a file (scripts/build-visit-file.js). Loaded
    // after the patch above, so it counts Discord visits like any other (it posts to /_v on this host).
    if (!(window as any).bsVisit) {
        const s = doc.createElement('script');
        s.src = '/visit-beacon.js';
        doc.head.appendChild(s);
    }
}
