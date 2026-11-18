// The daily puzzle's embed: the page script. It asks /_daily for today's question (the same answer
// as the puzzle's own page), shows the question and the answers, keeps the pick in this browser,
// shows the reveal, and offers one way on: a game with friends on bullshit.wtf, in a new tab, tagged
// with the site that carries the embed (embed-core.js).
//
// It runs inside an iframe on another site and never touches that page: no message to the parent,
// no cookie, nothing but this frame. What it keeps (the day's pick, a random browser id) is in this
// frame's own storage, which a browser keeps apart per site; with storage blocked it still plays.
// Plain ES5, like the puzzle's page: it must open in whatever browser the host page is read in.
(function () {
    'use strict';
    var cfg = window.BSEmbed;
    var core = window.BSDailyCore;
    var ec = window.BSEmbedCore;
    var s = cfg.s;
    var e = cfg.e;
    var KEY = 'bs-embed-' + s.lang;
    // The same id as the puzzle's page keeps (daily-client.js): one browser, one id, where they share storage.
    var ID_KEY = 'bs-daily-id';

    var site = '';
    try { site = ec.siteOf(window.location.ancestorOrigins, document.referrer); } catch (err) { site = ec.siteOf(null, document.referrer); }
    var tag = ec.embedTag(core.param(location.search, 'via'), site, core.cleanTag, location.hostname);
    var puzzle = null;
    var state = null;
    var uid = null;

    function $(id) { return document.getElementById(id); }

    function el(name, cls, text) {
        var node = document.createElement(name);
        if (cls) { node.className = cls; }
        if (text !== undefined && text !== null) { node.textContent = text; }
        return node;
    }

    function clear(node) {
        while (node.firstChild) { node.removeChild(node.firstChild); }
        return node;
    }

    function show(node, on) {
        if (on) { node.removeAttribute('hidden'); } else { node.setAttribute('hidden', ''); }
    }

    function load() {
        try {
            var v = JSON.parse(window.localStorage.getItem(KEY));
            return v && typeof v === 'object' ? v : null;
        } catch (err) {
            return null;
        }
    }

    function save() {
        try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* blocked: go on without */ }
    }

    function browserId() {
        try {
            var id = window.localStorage.getItem(ID_KEY);
            if (!/^[a-z0-9]{16}$/.test(id || '')) {
                id = core.newId(16);
                window.localStorage.setItem(ID_KEY, id);
            }
            return id;
        } catch (err) {
            return null;
        }
    }

    // ---------- the server: the puzzle's own /_daily ----------

    function getJson(url, done) {
        var x = new XMLHttpRequest();
        x.open('GET', url);
        x.timeout = 12000;
        x.onload = function () {
            var body = null;
            if (x.status === 200) {
                try { body = JSON.parse(x.responseText); } catch (err) { body = null; }
            }
            done(body);
        };
        x.onerror = x.ontimeout = function () { done(null); };
        x.send();
    }

    /**
     * One open, pick or press, as the puzzle's page posts it, with the embed's tag as the source: the
     * server writes it to `shares` (and a play-test's tag writes nothing). A beacon, so it leaves even
     * as the tap opens a new tab.
     */
    function post(method, more) {
        var body = { lang: s.lang, day: puzzle.day, m: method, src: tag, uid: uid };
        for (var key in more || {}) {
            if (Object.prototype.hasOwnProperty.call(more, key)) { body[key] = more[key]; }
        }
        var text = JSON.stringify(body);
        try {
            if (navigator.sendBeacon && navigator.sendBeacon('/_daily', text)) { return; }
        } catch (err) { /* fall through */ }
        try {
            var x = new XMLHttpRequest();
            x.open('POST', '/_daily');
            x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
            x.send(text);
        } catch (err) { /* a count lost, nothing the visitor needs */ }
    }

    // ---------- start ----------

    function start() {
        show($('e-error'), false);
        $('e-q').textContent = s.loading;
        getJson('/_daily?lang=' + s.lang, function (body) {
            if (!core.validPuzzle(body)) {
                $('e-q').textContent = s.loadError;
                show($('e-error'), true);
                return;
            }
            puzzle = body;
            begin();
        });
    }

    function begin() {
        uid = browserId();
        var lies = puzzle.options.length - 1;
        state = load();
        if (!state || state.day !== puzzle.day) {
            state = { day: puzzle.day, opened: false, order: null, pick: null };
        }
        if (!core.validOrder(state.order, lies, false)) {
            state.order = core.chooseOrder(lies, false);
            state.pick = null;
        }
        if (typeof state.pick !== 'number' || state.order.indexOf(state.pick) < 0) {
            state.pick = null;
        }
        $('e-kicker').textContent = core.kicker(s, puzzle.no, puzzle.pack === 'hanukkah' ? puzzle.candle : 0);
        document.body.className = puzzle.pack === 'hanukkah' ? 'hanukkah' : '';
        var q = clear($('e-q'));
        var parts = core.halves(puzzle.q);
        q.appendChild(document.createTextNode(parts[0]));
        q.appendChild(el('span', 'blank', '____'));
        q.appendChild(document.createTextNode(parts[1]));
        if (!state.opened) {
            state.opened = true;
            post('open');
        }
        save();
        if (state.pick === null) {
            ask();
        } else {
            reveal(true);
        }
    }

    // ---------- 1. the question ----------

    function ask() {
        show($('e-how'), true);
        show($('e-reveal'), false);
        var box = clear($('e-answers'));
        show(box, true);
        state.order.forEach(function (k) {
            var b = el('button', 'answer', puzzle.options[k].t);
            b.type = 'button';
            b.onclick = function () { pick(k); };
            box.appendChild(b);
        });
    }

    function pick(k) {
        if (state.pick !== null) { return; }
        state.pick = k;
        save();
        post(core.pickKind(k), { k: k });
        reveal(false);
    }

    // ---------- 2. the reveal ----------

    function reveal(already) {
        var kind = core.pickKind(state.pick);
        var total = puzzle.total || 0;
        var picks = puzzle.picks || {};
        var counted = total >= core.MIN_PICKS;
        var pct = core.fooledPct(picks, total);

        show($('e-how'), false);
        show($('e-answers'), false);
        var box = clear($('e-reveal'));
        show(box, true);
        if (already) { box.appendChild(el('p', 'note', s.played)); }
        box.appendChild(el('h2', 'head ' + (kind === 'truth' ? 'won' : 'lost'), kind === 'truth' ? s.headTruth : s.headLie));
        if (kind !== 'truth') {
            box.appendChild(el('p', 'sub', core.fill(s.truthLine, { answer: puzzle.options[0].t })));
        }

        var bars = el('div', 'bars');
        state.order.forEach(function (k) {
            var mine = k === state.pick;
            var row = el('div', 'bar' + (k === 0 ? ' truth' : '') + (mine ? ' mine' : ''));
            var share = counted ? core.percent(picks[k] || 0, total) : null;
            if (share !== null) {
                var fill = el('span', 'fill');
                fill.style.width = share + '%';
                row.appendChild(fill);
            }
            var line = el('span', 'line');
            line.appendChild(el('span', 'text', puzzle.options[k].t));
            var tags = el('span', 'tags');
            tags.appendChild(el('span', 'tag', k === 0 ? s.labelTruth : s.labelLie));
            if (mine) { tags.appendChild(el('span', 'tag pick', s.labelPick)); }
            line.appendChild(tags);
            if (share !== null) { line.appendChild(el('span', 'pct', share + '%')); }
            row.appendChild(line);
            bars.appendChild(row);
        });
        box.appendChild(bars);
        box.appendChild(el('p', 'numbers', counted ? core.fill(s.numbers, { p: pct, n: total }) : s.tooFew));

        // The way back to the game: a table with friends, on bullshit.wtf, in a new tab.
        var hanukkah = puzzle.pack === 'hanukkah';
        var go = el('a', 'btn primary play', hanukkah ? e.playHanukkah : e.play);
        go.href = ec.playUrl(location.origin, s, tag, hanukkah ? 'hanukkah' : '', core.createUrl);
        go.target = '_blank';
        go.rel = 'noopener';
        go.setAttribute('aria-describedby', 'e-newtab');
        go.onclick = function () { post('create'); };
        box.appendChild(go);
        box.appendChild(el('p', 'hint', e.playHint));
        var more = el('a', 'more', e.more + ' ↗');
        more.href = ec.dailyUrl(location.origin, s, tag);
        more.target = '_blank';
        more.rel = 'noopener';
        more.setAttribute('aria-describedby', 'e-newtab');
        box.appendChild(el('p', 'more-line')).appendChild(more);
    }

    // The logo and the header link go to the puzzle on the game's site, with the same tag.
    var home = $('e-home');
    home.href = ec.dailyUrl(location.origin, s, tag);
    $('e-retry').onclick = start;
    start();
})();
