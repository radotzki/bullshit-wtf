// The daily puzzle's page script: asks /_daily for today's question, shows it, keeps the pick in
// this browser, and builds the reveal. daily-page.js writes it into the page after daily-core.js
// (the rules, tested in Node) and the game's own answer and name checks.
//
// Everything a person typed (a friend's lie and name from a link, the visitor's own lie) is put on
// the page with textContent only, never as HTML, and only after it passed core.screenLie.
// Plain ES5: the page must open in whatever browser a chat app carries.
(function () {
    'use strict';
    var cfg = window.BSDaily;
    var core = window.BSDailyCore;
    var shared = window.BSDailyShared;
    var s = cfg.s;
    var KEY = 'bs-daily-' + s.lang;
    var LIE_KEY = 'bs-daily-lie-' + s.lang;
    var ID_KEY = 'bs-daily-id';

    var arrival = core.readArrival(location.search);
    var puzzle = null;
    var state = null;
    var uid = null;
    var timer = null;

    function $(id) { return document.getElementById(id); }

    function el(tag, cls, text) {
        var node = document.createElement(tag);
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

    // ---------- this browser's memory (the page works without it, and then forgets the pick) ----------

    function load(key) {
        try {
            var v = JSON.parse(window.localStorage.getItem(key));
            return v && typeof v === 'object' ? v : null;
        } catch (e) {
            return null;
        }
    }

    function save(key, value) {
        try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* blocked: go on without */ }
    }

    // A random id made on the first visit: it tells one browser's rows from another's and nothing else.
    function browserId() {
        try {
            var id = window.localStorage.getItem(ID_KEY);
            if (!/^[a-z0-9]{16}$/.test(id || '')) {
                id = core.newId(16);
                window.localStorage.setItem(ID_KEY, id);
            }
            return id;
        } catch (e) {
            return null;
        }
    }

    function dayBefore(day) {
        var t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) - 864e5;
        return new Date(t).toISOString().slice(0, 10);
    }

    // ---------- the server ----------

    function getJson(url, done) {
        var x = new XMLHttpRequest();
        x.open('GET', url);
        x.timeout = 12000;
        x.onload = function () {
            var body = null;
            if (x.status === 200) {
                try { body = JSON.parse(x.responseText); } catch (e) { body = null; }
            }
            done(body);
        };
        x.onerror = x.ontimeout = function () { done(null); };
        x.send();
    }

    // One pick or one press. A beacon, so it leaves even when the tap opens another page.
    function post(method, more) {
        var body = { lang: s.lang, day: puzzle.day, m: method, src: state.src || '', uid: uid };
        for (var key in more || {}) {
            if (Object.prototype.hasOwnProperty.call(more, key) && more[key] !== undefined) { body[key] = more[key]; }
        }
        var text = JSON.stringify(body);
        try {
            if (navigator.sendBeacon && navigator.sendBeacon('/_daily', text)) { return; }
        } catch (e) { /* fall through */ }
        try {
            var x = new XMLHttpRequest();
            x.open('POST', '/_daily');
            x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
            x.send(text);
        } catch (e) { /* a count lost, nothing the visitor needs */ }
    }

    // ---------- the question's parts ----------

    function truth() { return puzzle.options[0].t; }

    function houseLies() {
        var lies = [];
        for (var i = 1; i < puzzle.options.length; i++) { lies.push(puzzle.options[i].t); }
        return lies;
    }

    /** A friend's lie from a link or from this browser's memory, if it still passes the screen. */
    function screened(friend) {
        if (!friend || typeof friend.name !== 'string' || typeof friend.lie !== 'string' || !core.cleanLinkId(friend.f)) {
            return null;
        }
        if (core.tidy(friend.name) !== friend.name || core.tidy(friend.lie) !== friend.lie) {
            return null;
        }
        if (core.screenLie(friend.lie, friend.name, truth(), houseLies(), shared.isSameAnswer, shared.nameFlag)) {
            return null;
        }
        return { f: friend.f, name: friend.name, lie: friend.lie };
    }

    function textOf(k, friend) {
        return k === 'f' ? friend.lie : puzzle.options[k].t;
    }

    function setQuestion() {
        var q = clear($('d-q'));
        var parts = core.halves(puzzle.q);
        q.appendChild(document.createTextNode(parts[0]));
        q.appendChild(el('span', 'blank', '____'));
        q.appendChild(document.createTextNode(parts[1]));
    }

    function setKicker() {
        $('d-kicker').textContent = core.kicker(s, puzzle.no, puzzle.pack === 'hanukkah' ? puzzle.candle : 0);
        var hanukkah = puzzle.pack === 'hanukkah';
        document.body.className = hanukkah ? 'hanukkah' : '';
        var candles = clear($('d-candles'));
        show(candles, hanukkah && puzzle.candle >= 1);
        if (hanukkah && puzzle.candle >= 1) {
            for (var i = 1; i <= 8; i++) { candles.appendChild(el('i', i <= puzzle.candle ? 'lit' : '')); }
        }
    }

    function note(text) {
        var n = $('d-note');
        n.textContent = text || '';
        show(n, !!text);
    }

    // ---------- start ----------

    function start() {
        show($('d-error'), false);
        $('d-q').textContent = s.loading;
        getJson('/_daily?lang=' + s.lang, function (body) {
            if (!core.validPuzzle(body)) {
                return failed();
            }
            puzzle = body;
            begin();
        });
    }

    function failed() {
        $('d-q').textContent = s.loadError;
        show($('d-error'), true);
        show($('d-how'), false);
    }

    function begin() {
        uid = browserId();
        state = load(KEY);
        if (!state || state.day !== puzzle.day) {
            state = { day: puzzle.day, src: '', opened: false, order: null, pick: null, friend: null };
        }
        if (arrival.tag) { state.src = arrival.tag; }
        state.src = core.cleanTag(state.src);

        // A lie link: for today's question only, and never this browser's own.
        var otherDay = false;
        var fromLink = null;
        var mine = load(LIE_KEY);
        if (arrival.l) {
            if (arrival.no !== puzzle.no) {
                otherDay = true;
            } else {
                var carried = core.decodeLie(arrival.l);
                fromLink = carried && arrival.f ? screened({ f: arrival.f, name: carried.name, lie: carried.lie }) : null;
                if (fromLink && mine && mine.day === puzzle.day && mine.f === fromLink.f) { fromLink = null; }
            }
        }

        state.friend = screened(state.friend);
        var lies = puzzle.options.length - 1;
        var picked = state.pick === 0 || state.pick === 'f' || (typeof state.pick === 'number' && state.pick >= 1 && state.pick <= lies);
        if (!picked) { state.pick = null; }
        if (state.pick === null && fromLink && (!state.friend || state.friend.f !== fromLink.f)) {
            state.friend = fromLink;
            state.order = null;
        }
        if (!core.validOrder(state.order, lies, !!state.friend)) {
            state.order = core.chooseOrder(lies, !!state.friend);
            state.pick = null;
        }
        if (state.pick !== null && state.order.indexOf(state.pick) < 0) { state.pick = null; }

        setKicker();
        setQuestion();
        if (!state.opened) {
            state.opened = true;
            post('open');
        }
        save(KEY, state);

        if (state.pick !== null) {
            // Already played: a friend's lie that arrives now is shown beside the answers, not played.
            var guest = fromLink && (!state.friend || state.friend.f !== fromLink.f) ? fromLink : null;
            reveal(true, guest);
        } else {
            ask(otherDay);
        }
    }

    // ---------- 1. the question ----------

    function ask(otherDay) {
        var friend = state.friend;
        note(otherDay ? s.otherDay : '');
        var how = $('d-how');
        how.textContent = friend
            ? (friend.name ? core.fill(s.friendNamed, { name: friend.name }) : s.friendUnnamed)
            : s.instruction;
        show(how, true);
        show($('d-reveal'), false);
        show($('d-foot'), true);
        var box = clear($('d-answers'));
        show(box, true);
        state.order.forEach(function (k) {
            var b = el('button', 'answer', textOf(k, friend));
            b.type = 'button';
            b.onclick = function () { pick(k); };
            box.appendChild(b);
        });
    }

    function pick(k) {
        if (state.pick !== null) { return; }
        state.pick = k;
        save(KEY, state);
        post(core.pickKind(k), { k: k, f: state.friend ? state.friend.f : undefined });
        reveal(false, null);
        try { $('d-reveal').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* older browsers */ }
    }

    // ---------- 2. the reveal ----------

    function reveal(already, guest) {
        var friend = state.friend;
        var kind = core.pickKind(state.pick);
        var total = puzzle.total || 0;
        var picks = puzzle.picks || {};
        var counted = total >= core.MIN_PICKS;
        var pct = core.fooledPct(picks, total);

        note(already ? s.played : '');
        show($('d-how'), false);
        show($('d-answers'), false);
        show($('d-foot'), false);
        var box = clear($('d-reveal'));
        show(box, true);

        // The headline, and the line under it.
        var head = kind === 'truth' ? s.headTruth
            : kind === 'house' ? s.headLie
                : (friend.name ? core.fill(s.headFriendNamed, { name: friend.name }) : s.headFriendUnnamed);
        box.appendChild(el('h2', 'head ' + (kind === 'truth' ? 'won' : 'lost'), head));
        if (kind === 'truth' && friend) {
            box.appendChild(el('p', 'sub', friend.name
                ? core.fill(s.friendMissedNamed, { name: friend.name, lie: friend.lie })
                : core.fill(s.friendMissedUnnamed, { lie: friend.lie })));
        } else if (kind !== 'truth') {
            box.appendChild(el('p', 'sub', core.fill(s.truthLine, { answer: truth() })));
        }

        // The answers again, as bars.
        var bars = el('div', 'bars');
        var rows = state.order.map(function (k) { return { k: k, by: friend }; });
        if (guest) { rows.push({ k: 'f', by: guest, guest: true }); }
        rows.forEach(function (r) {
            var mineRow = !r.guest && r.k === state.pick;
            var row = el('div', 'bar' + (r.k === 0 ? ' truth' : '') + (mineRow ? ' mine' : ''));
            var share = counted && r.k !== 'f' ? core.percent(picks[r.k] || 0, total) : null;
            if (share !== null) {
                var fillBar = el('span', 'fill');
                fillBar.style.width = share + '%';
                row.appendChild(fillBar);
            }
            var line = el('span', 'line');
            line.appendChild(el('span', 'text', textOf(r.k, r.by)));
            if (share !== null) { line.appendChild(el('span', 'pct', share + '%')); }
            row.appendChild(line);
            var tags = el('span', 'tags');
            tags.appendChild(el('span', 'tag', r.k === 0 ? s.labelTruth
                : r.k === 'f' ? (r.by.name ? core.fill(s.labelFriendNamed, { name: r.by.name }) : s.labelFriendUnnamed)
                    : s.labelLie));
            if (mineRow) { tags.appendChild(el('span', 'tag pick', s.labelPick)); }
            row.appendChild(tags);
            bars.appendChild(row);
        });
        box.appendChild(bars);
        box.appendChild(el('p', 'numbers', counted ? core.fill(s.numbers, { p: pct, n: total }) : s.tooFew));

        var cite = core.safeCite(puzzle.cite);
        if (cite) {
            var source = el('a', 'source', s.source);
            source.href = cite;
            source.target = '_blank';
            source.rel = 'noopener nofollow';
            box.appendChild(el('p', 'source-line')).appendChild(source);
        }

        // Send the result. The message carries the question and never an answer.
        var message = core.shareText(s, kind === 'truth' ? 'truth' : 'lie', puzzle, pct, core.resultUrl(location.origin, s));
        box.appendChild(sendButtons(message, s.send, ''));

        box.appendChild(foolSection());
        box.appendChild(gameSection());

        var next = el('p', 'next');
        box.appendChild(next);
        countdown(next);
        var y = core.yesterdayLine(s, puzzle.yesterday);
        if (y) { box.appendChild(el('p', 'yesterday', y)); }
    }

    /** The WhatsApp button and the smaller SHARE (the phone's share sheet) or COPY (where there is none). */
    function sendButtons(message, label, prefix, before) {
        var wrap = el('div', 'send');
        var wa = el('a', 'btn primary', label);
        var other = el('button', 'btn secondary', navigator.share ? s.share : s.copy);
        other.type = 'button';
        var text = function () { return typeof message === 'function' ? message() : message; };
        wa.href = typeof message === 'function' ? '#' : 'https://wa.me/?text=' + encodeURIComponent(message);
        wa.target = '_blank';
        wa.rel = 'noopener';
        wa.onclick = function (e) {
            var t = text();
            if (!t) { e.preventDefault(); return; }
            wa.href = 'https://wa.me/?text=' + encodeURIComponent(t);
            post(prefix + 'whatsapp');
            if (before) { before(); }
        };
        other.onclick = function () {
            var t = text();
            if (!t) { return; }
            if (before) { before(); }
            if (navigator.share) {
                navigator.share({ text: t }).then(function () { post(prefix + 'native'); }, function () { /* closed the sheet */ });
                return;
            }
            copy(t, function () {
                post(prefix + 'copy');
                other.textContent = s.copied;
                setTimeout(function () { other.textContent = s.copy; }, 2000);
            });
        };
        wrap.appendChild(wa);
        wrap.appendChild(other);
        return wrap;
    }

    function copy(text, done) {
        var old = function () {
            var area = el('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            try { if (document.execCommand('copy')) { done(); } } catch (e) { /* no clipboard at all */ }
            document.body.removeChild(area);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, old);
        } else {
            old();
        }
    }

    // ---------- now fool your friends ----------

    function foolSection() {
        var box = el('section', 'card fool');
        box.appendChild(el('h2', '', s.foolTitle));
        box.appendChild(el('p', '', s.foolText));
        var mine = load(LIE_KEY);
        var lie = field(box, 'd-lie', s.foolLie, core.LIE_MAX, '');
        var name = field(box, 'd-name', s.foolName, core.NAME_MAX, mine && typeof mine.name === 'string' ? mine.name : '');
        var error = el('p', 'error');
        error.setAttribute('role', 'alert');
        show(error, false);
        box.appendChild(error);
        var count = el('p', 'count');
        show(count, false);

        // The link for the typed lie, or nothing (and the reason on screen) when it may not go out.
        var link = function () {
            var typed = core.tidy(lie.value);
            var who = core.tidy(name.value);
            var why = core.screenLie(typed, who, truth(), houseLies(), shared.isSameAnswer, shared.nameFlag);
            error.textContent = why === 'truth' ? s.lieIsTruth : why === 'taken' ? s.lieIsTaken : why === 'refused' ? s.lieRefused : '';
            show(error, !!error.textContent);
            if (why) {
                lie.focus();
                return '';
            }
            // The same lie sent twice (WhatsApp, then a copy) keeps one link, so its count is one count.
            var kept = load(LIE_KEY);
            var id = kept && kept.day === puzzle.day && kept.lie === typed && kept.name === who && core.cleanLinkId(kept.f)
                ? kept.f : core.newId(8);
            save(LIE_KEY, { day: puzzle.day, f: id, name: who, lie: typed });
            return core.shareText(s, 'fool', puzzle, null, core.foolUrl(location.origin, s, puzzle.no, id, who, typed));
        };
        box.appendChild(sendButtons(link, s.foolSend, 'fool-', function () { sentCount(count, true); }));
        box.appendChild(count);
        sentCount(count, false);
        return box;
    }

    function field(box, id, label, max, value) {
        var wrap = el('label', 'field');
        wrap.setAttribute('for', id);
        wrap.appendChild(el('span', '', label));
        var input = el('input');
        input.id = id;
        input.type = 'text';
        input.maxLength = max;
        input.autocomplete = 'off';
        input.setAttribute('dir', 'auto');
        input.value = value;
        wrap.appendChild(input);
        box.appendChild(wrap);
        return input;
    }

    /** "Your lie fooled 3 of 5 friends so far", for a lie this browser sent today or yesterday. */
    function sentCount(line, justSent) {
        var mine = load(LIE_KEY);
        if (!mine || typeof mine.lie !== 'string' || !core.cleanLinkId(mine.f)
            || (mine.day !== puzzle.day && mine.day !== dayBefore(puzzle.day))) {
            return;
        }
        var say = function (c) {
            line.textContent = c && c.seen > 0
                ? core.fill(s.count, { lie: mine.lie, x: Math.min(c.fooled || 0, c.seen), y: c.seen })
                : s.countNone;
            show(line, true);
        };
        if (justSent) {
            return say(null);
        }
        getJson('/_daily?lang=' + s.lang + '&d=' + mine.day + '&f=' + mine.f, function (body) {
            say(body && body.friend ? body.friend : null);
        });
    }

    // ---------- this is half the game ----------

    function gameSection() {
        var hanukkah = puzzle.pack === 'hanukkah';
        var box = el('section', 'card game');
        box.appendChild(el('h2', '', s.gameTitle));
        box.appendChild(el('p', '', s.gameText));
        var go = el('a', 'btn primary', hanukkah ? s.gameStartHanukkah : s.gameStart);
        go.href = core.createUrl(s, state.src, hanukkah ? 'hanukkah' : '');
        go.onclick = function () { post('create'); };
        box.appendChild(go);
        box.appendChild(el('p', 'hint', core.fill(s.gameHint, { max: cfg.max })));
        return box;
    }

    // ---------- the next question ----------

    function countdown(line) {
        if (timer) { clearInterval(timer); }
        var tick = function () {
            var left = puzzle.nextAt - Date.now();
            if (left > 0) {
                // A phone whose clock is far off would count from more than a day: say nothing then.
                line.textContent = left <= 25 * 3600 * 1000 ? core.fill(s.countdown, { t: core.clock(left) }) : '';
                return;
            }
            clearInterval(timer);
            timer = null;
            clear(line);
            var again = el('button', 'btn primary', s.newQuestion);
            again.type = 'button';
            // Today's question, without yesterday's lie link in the address.
            again.onclick = function () { location.href = s.path + (state.src ? '?via=' + state.src : ''); };
            line.appendChild(again);
        };
        tick();
        timer = setInterval(tick, 1000);
    }

    $('d-retry').onclick = start;
    start();
})();
