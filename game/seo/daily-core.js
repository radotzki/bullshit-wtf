// The daily puzzle's rules that need no page: the friend's lie inside a link, the screen a typed lie
// must pass, the order of the answers, the messages people send, the links. daily-page.js writes this
// file into the page as it is, and test/daily-core.test.js runs it in Node, so it is plain ES5 and
// touches neither the document nor the network.
(function (root) {
    'use strict';

    /** Percentages are shown from this many picks on. */
    var MIN_PICKS = 20;
    /** A friend's lie and name: as long as the game's own nickname, and short enough for an answer. */
    var LIE_MAX = 40;
    var NAME_MAX = 9;
    var LINK_ID = /^[a-z0-9]{8}$/;
    var TAG = /^[a-z0-9][a-z0-9-]{0,39}$/;

    // Characters that never belong in an answer: controls, and the invisible marks that can turn
    // text round or hide it (zero width, direction overrides and isolates, the byte order mark).
    var UNSEEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;

    function fill(template, values) {
        return String(template).replace(/\{(\w+)\}/g, function (all, key) {
            return values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : '';
        });
    }

    /** Typed text as it will be shown: no unseen characters, single spaces, no space at the ends. */
    function tidy(text) {
        return String(text == null ? '' : text).replace(/\s+/g, ' ').replace(UNSEEN, '').replace(/ +/g, ' ').trim();
    }

    /** The count of letters as a reader sees them (a pair of surrogates is one). */
    function lengthOf(text) {
        return text.replace(/[\ud800-\udbff][\udc00-\udfff]/g, '_').length;
    }

    // ---------- the lie in the link ----------

    function toBase64Url(text) {
        // UTF-8 first: btoa takes bytes only.
        var bytes = unescape(encodeURIComponent(text));
        return root.btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function fromBase64Url(code) {
        if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{2,400}$/.test(code)) {
            return null;
        }
        try {
            var b64 = code.replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) { b64 += '='; }
            return decodeURIComponent(escape(root.atob(b64)));
        } catch (e) {
            return null;
        }
    }

    /** The `l=` of a lie link: [name, lie], so the address does not give the lie away at a glance. */
    function encodeLie(name, lie) {
        return toBase64Url(JSON.stringify([tidy(name), tidy(lie)]));
    }

    /**
     * The name and lie a link carries, or null when it is not exactly that: a list of two texts,
     * already tidy, the lie 1 to 40 letters and the name 0 to 9. Anything else (markup is only ever
     * shown as text, but a longer text, an object, hidden characters) is no lie at all.
     */
    function decodeLie(code) {
        var text = fromBase64Url(code);
        if (text === null) {
            return null;
        }
        var list;
        try { list = JSON.parse(text); } catch (e) { return null; }
        if (!list || Object.prototype.toString.call(list) !== '[object Array]' || list.length !== 2
            || typeof list[0] !== 'string' || typeof list[1] !== 'string') {
            return null;
        }
        var name = list[0];
        var lie = list[1];
        if (tidy(name) !== name || tidy(lie) !== lie || !lie || lengthOf(lie) > LIE_MAX || lengthOf(name) > NAME_MAX) {
            return null;
        }
        return { name: name, lie: lie };
    }

    /** A link, an address, a handle or a phone number: what a lie may not carry to a friend's screen. */
    function carriesContact(text) {
        return /@/.test(text)
            || /\d{5,}/.test(text)
            || /(https?:|www\.|:\/\/)/i.test(text)
            || /[a-z0-9-]\.[a-z]{2,}(\/|$|[^a-z])/i.test(text + ' ');
    }

    /**
     * Why a typed lie (and name) is refused, or null when it may go out. Run before sending and
     * again before showing, with the same rules as the game: `sameAnswer` is the game's
     * isSameAnswer and `nameFlag` its nickname filter.
     *   'empty'    nothing typed
     *   'truth'    it is the true answer, typed a little differently
     *   'taken'    it is one of the house's lies
     *   'refused'  too long, a slur or sex word, a link, an @, a run of 5 digits or more
     */
    function screenLie(lie, name, truth, lies, sameAnswer, nameFlag) {
        lie = tidy(lie);
        name = tidy(name);
        if (!lie) {
            return 'empty';
        }
        if (lengthOf(lie) > LIE_MAX || lengthOf(name) > NAME_MAX) {
            return 'refused';
        }
        if (sameAnswer(lie, truth)) {
            return 'truth';
        }
        for (var i = 0; i < lies.length; i++) {
            if (sameAnswer(lie, lies[i])) {
                return 'taken';
            }
        }
        if (nameFlag(lie) || nameFlag(name) || carriesContact(lie) || carriesContact(name)) {
            return 'refused';
        }
        return null;
    }

    /** A sender's link id: 8 small letters or digits, new for every lie, and not the browser's id. */
    function newId(length, random) {
        var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        var out = '';
        for (var i = 0; i < length; i++) {
            out += chars.charAt(Math.floor((random || Math.random)() * chars.length));
        }
        return out;
    }

    function cleanLinkId(f) {
        return typeof f === 'string' && LINK_ID.test(f) ? f : null;
    }

    // ---------- the answers ----------

    /**
     * The four answers a browser shows, in an order shuffled once: the truth (0), and three of the
     * question's lies, or two of them and the friend's lie ('f').
     */
    function chooseOrder(lies, withFriend, random) {
        var rnd = random || Math.random;
        var shuffle = function (list) {
            for (var i = list.length - 1; i > 0; i--) {
                var j = Math.floor(rnd() * (i + 1));
                var t = list[i]; list[i] = list[j]; list[j] = t;
            }
            return list;
        };
        var house = [];
        for (var k = 1; k <= lies; k++) { house.push(k); }
        var shown = shuffle(house).slice(0, withFriend ? 2 : 3);
        shown.push(0);
        if (withFriend) { shown.push('f'); }
        return shuffle(shown);
    }

    /** An order kept from earlier today still fits the question: the truth once, known answers only. */
    function validOrder(order, lies, withFriend) {
        if (!order || Object.prototype.toString.call(order) !== '[object Array]' || order.length < 2 || order.length > 4) {
            return false;
        }
        var seen = {};
        for (var i = 0; i < order.length; i++) {
            var k = order[i];
            var ok = k === 'f' ? withFriend : (typeof k === 'number' && k === Math.floor(k) && k >= 0 && k <= lies);
            if (!ok || seen[k]) {
                return false;
            }
            seen[k] = true;
        }
        return !!seen[0] && (!withFriend || !!seen.f);
    }

    /** What a pick was, for the count: the truth, a house lie, or the friend's lie. */
    function pickKind(k) {
        return k === 0 ? 'truth' : (k === 'f' ? 'friend' : 'house');
    }

    function percent(part, total) {
        return total > 0 ? Math.round(100 * part / total) : 0;
    }

    /** Of 100 of today's picks, how many were a lie; null while there are too few to show. */
    function fooledPct(picks, total) {
        if (!(total >= MIN_PICKS)) {
            return null;
        }
        return percent(total - ((picks && picks[0]) || 0), total);
    }

    // ---------- the words around a question ----------

    /** The sentence as a message shows it: the blank as a line. */
    function sentence(q) {
        return String(q).replace(/\$\s?blank\s?\$/gi, '____');
    }

    /** The question's two halves, around the blank. */
    function halves(q) {
        var parts = String(q).split(/\$\s?blank\s?\$/i);
        return [parts[0] || '', parts.slice(1).join('____')];
    }

    function noTag(no) {
        return no >= 1 ? ' #' + no : '';
    }

    function kicker(s, no, candle) {
        if (candle >= 1 && candle <= 8) {
            return fill(s.kickerCandle, { candle: s.candles[candle - 1], noTag: noTag(no) });
        }
        return fill(s.kicker, { dot: no >= 1 ? fill(s.kickerDot, { no: no }) : '' });
    }

    /**
     * The message a player sends. kind: 'truth' (found it), 'lie' (fell for one), 'fool' (a lie of
     * their own is in the link). It carries the question and never an answer. `pct` is null while
     * too few have played, and the sentence with the percentage is then left out.
     */
    function shareText(s, kind, puzzle, pct, url) {
        var first;
        if (kind === 'fool') {
            first = fill(s.shareFool, { noTag: noTag(puzzle.no) });
        } else {
            var head = kind === 'truth' ? s.shareTruth : s.shareLie;
            var tail = kind === 'truth' ? s.shareTruthPct : s.shareLiePct;
            first = fill(head, { noTag: noTag(puzzle.no) }) + (pct === null || pct === undefined ? '' : fill(tail, { p: pct }));
        }
        var lines = [first, '"' + sentence(puzzle.q) + '"'];
        if (kind !== 'fool') {
            lines.push(kind === 'truth' ? s.shareTruthAsk : s.shareLieAsk);
        }
        lines.push(url);
        return lines.join('\n');
    }

    // ---------- links ----------

    /** A ?via= tag as the game keeps it: small letters, digits and dashes, 40 at most. */
    function cleanTag(tag) {
        var t = typeof tag === 'string' ? tag.toLowerCase() : '';
        return TAG.test(t) ? t : '';
    }

    function param(search, name) {
        var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(search || '');
        if (!m) {
            return '';
        }
        try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return ''; }
    }

    /** What the address a visitor arrived on carries: the tag, and a friend's lie if it is a lie link. */
    function readArrival(search) {
        var n = param(search, 'n');
        return {
            tag: cleanTag(param(search, 'via')),
            no: /^-?\d{1,6}$/.test(n) ? Number(n) : null,
            f: cleanLinkId(param(search, 'f')),
            l: param(search, 'l'),
        };
    }

    /** The link in a sent result: today's page in the sender's language. */
    function resultUrl(origin, s) {
        return origin + s.path + '?via=daily-share';
    }

    /** The link that carries a lie: the day's number, the sender's link id, and the lie itself. */
    function foolUrl(origin, s, no, id, name, lie) {
        return origin + s.path + '?via=daily-fool&n=' + no + '&f=' + id + '&l=' + encodeLie(name, lie);
    }

    /**
     * START A GAME: the create page, tagged so the game says it came from the puzzle. The tag is the
     * one the visitor arrived with (a friend's result or lie, the home page, a search page, a post),
     * or plain `daily`.
     */
    function createUrl(s, tag, pack) {
        var query = ['via=' + (cleanTag(tag) || 'daily')];
        if (s.lang === 'he') { query.push('lang=he'); }
        if (pack === 'hanukkah') { query.push('pack=hanukkah'); }
        return '/create-game?' + query.join('&');
    }

    function clock(ms) {
        var total = Math.max(0, Math.floor(ms / 1000));
        var two = function (n) { return (n < 10 ? '0' : '') + n; };
        return two(Math.floor(total / 3600)) + ':' + two(Math.floor(total / 60) % 60) + ':' + two(total % 60);
    }

    /** "Yesterday: <the sentence with its truth>." and, with enough picks, how many were fooled. */
    function yesterdayLine(s, y) {
        if (!y || !y.text) {
            return '';
        }
        var line = fill(s.yesterday, { s: String(y.text).replace(/[.!?]+$/, '') });
        if (y.total >= MIN_PICKS && typeof y.fooledPct === 'number') {
            line += ' ' + fill(s.yesterdayPct, { p: y.fooledPct });
        }
        return line;
    }

    /** The answer from /_daily is a whole puzzle: anything else (a cache's error page) is not shown. */
    function validPuzzle(p) {
        if (!p || typeof p !== 'object' || typeof p.q !== 'string' || typeof p.day !== 'string' || typeof p.no !== 'number') {
            return false;
        }
        if (Object.prototype.toString.call(p.options) !== '[object Array]' || p.options.length < 4) {
            return false;
        }
        for (var i = 0; i < p.options.length; i++) {
            if (!p.options[i] || p.options[i].k !== i || typeof p.options[i].t !== 'string' || !p.options[i].t) {
                return false;
            }
        }
        return p.truth === 0;
    }

    /** A source link is shown only when it is a web address. */
    function safeCite(cite) {
        return typeof cite === 'string' && /^https?:\/\/[^\s"<>]+$/.test(cite) ? cite : '';
    }

    var api = {
        MIN_PICKS: MIN_PICKS, LIE_MAX: LIE_MAX, NAME_MAX: NAME_MAX,
        fill: fill, tidy: tidy, encodeLie: encodeLie, decodeLie: decodeLie, carriesContact: carriesContact,
        screenLie: screenLie, newId: newId, cleanLinkId: cleanLinkId, chooseOrder: chooseOrder, validOrder: validOrder,
        pickKind: pickKind, percent: percent, fooledPct: fooledPct, sentence: sentence, halves: halves, noTag: noTag,
        kicker: kicker, shareText: shareText, cleanTag: cleanTag, readArrival: readArrival, resultUrl: resultUrl,
        foolUrl: foolUrl, createUrl: createUrl, clock: clock, yesterdayLine: yesterdayLine, validPuzzle: validPuzzle,
        safeCite: safeCite,
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.BSDailyCore = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
