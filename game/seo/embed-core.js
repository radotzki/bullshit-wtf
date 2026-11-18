// The daily puzzle's embed: the rules that need no page. Which site carries the embed (its host
// name, from the parent page's origin or the referrer), the ?via= tag that names it, and the links
// out. embed-page.js writes this file into the embed as it is, after daily-core.js, and
// test/embed.test.js runs it in Node, so it is plain ES5 and touches neither the document nor the
// network.
(function (root) {
    'use strict';

    /** The tag's head: every embed's tag starts with it (embed, embed-<site>, embed-preview). */
    var PREFIX = 'embed';
    /** The game keeps tags of 40 letters at most: 'embed-' leaves 34 for the site. */
    var SITE_MAX = 34;
    /** This game's own hosts: the copy page's live preview, and the Firebase addresses of the site. */
    var OWN = /(^|\.)bullshit\.wtf$|^bullshit-wtf-(prod|dev)(--[a-z0-9-]+)?\.(web\.app|firebaseapp\.com)$/;

    /**
     * The host name in an address or an origin ('https://www.school.org.il/page?x' gives
     * 'www.school.org.il'), small letters, with no user, port, path or query; '' when there is none.
     */
    function hostOf(address) {
        var m = /^[a-z][a-z0-9+.-]*:\/\/([^\/?#]*)/i.exec(typeof address === 'string' ? address : '');
        if (!m) {
            return '';
        }
        var host = m[1].replace(/^[^@]*@/, '').replace(/:\d*$/, '').toLowerCase();
        return /^[a-z0-9.-]{1,253}$/.test(host) ? host : '';
    }

    /**
     * The site that shows the embed: the parent page's origin where the browser tells it
     * (location.ancestorOrigins, in Chrome and Safari, whatever the parent's referrer rule), else the
     * referrer (the parent page's address, or its origin only, by the browser's default rule).
     */
    function siteOf(ancestorOrigins, referrer) {
        var first = ancestorOrigins && ancestorOrigins.length ? ancestorOrigins[0] : '';
        return hostOf(first) || hostOf(referrer);
    }

    /** A host as a tag's tail: 'www.school.org.il' gives 'school-org-il'; 34 letters at most. */
    function siteSlug(host) {
        var slug = String(host || '').toLowerCase().replace(/^www\d*\./, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return slug.slice(0, SITE_MAX).replace(/-+$/, '');
    }

    /**
     * The ?via= tag of everything the embed sends and links to:
     *   - the iframe's own ?via= when it has a clean one (a play-test's ?via=test stays a test, and a
     *     site can be given a tag of its own),
     *   - 'embed-preview' on the game's own site (the copy page's live preview): bullshit.wtf, its
     *     Firebase addresses, or the host the embed itself is served from (`ownHost`),
     *   - 'embed-<site>' for any other site ('embed-school-org-il'),
     *   - 'embed' when the site can't be told (no referrer, an address that is no host).
     * `cleanTag` is the puzzle's own (daily-core.js), so the tag is one the game keeps.
     */
    function embedTag(ownVia, site, cleanTag, ownHost) {
        var own = cleanTag(ownVia);
        if (own) {
            return own;
        }
        if (site && (OWN.test(site) || site === String(ownHost || '').toLowerCase())) {
            return PREFIX + '-preview';
        }
        var slug = siteSlug(site);
        return cleanTag(slug ? PREFIX + '-' + slug : PREFIX) || PREFIX;
    }

    /** The game's address for a link that leaves the iframe: always the whole address, for a new tab. */
    function playUrl(origin, s, tag, pack, createUrl) {
        return origin + createUrl(s, tag, pack);
    }

    /** The daily puzzle itself, where the result and a lie can be sent to friends. */
    function dailyUrl(origin, s, tag) {
        return origin + s.path + (tag ? '?via=' + tag : '');
    }

    var api = { PREFIX: PREFIX, SITE_MAX: SITE_MAX, hostOf: hostOf, siteOf: siteOf, siteSlug: siteSlug, embedTag: embedTag, playUrl: playUrl, dailyUrl: dailyUrl };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.BSEmbedCore = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
