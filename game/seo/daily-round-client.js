// The page script of a chat group's round (the daily puzzle's group mode). daily-client.js runs the
// page and hands this script its helpers (window.BSDailyRound is called with them): this script
// draws the starter's card on the puzzle's reveal, and everything a round link opens: the question
// with the group's lies, the reveal with the board, the player's card, the return visit and the
// final board. The rules and the messages are in daily-round-core.js; the server's side is
// functions/src/controllers/daily-round.ts.
//
// Everything a person typed (names, lies) is put on the page with textContent only, never as HTML.
// Plain ES5, like the rest of the page.
(function () {
    'use strict';

    window.BSDailyRound = function (page) {
        var s = page.s;
        var core = page.core;
        var rc = window.BSDailyRoundCore;
        var el = page.el;
        var show = page.show;
        var clear = page.clear;
        var $ = page.$;
        var ROUNDS_KEY = 'bs-daily-rounds-' + s.lang;
        var START_KEY = 'bs-daily-start-' + s.lang;
        var view = null;

        // ---------- this browser's memory of its rounds ----------

        function rounds() {
            return page.load(ROUNDS_KEY) || {};
        }

        function remember(g, more) {
            var all = rounds();
            var entry = all[g] || {};
            for (var key in more) {
                if (Object.prototype.hasOwnProperty.call(more, key)) { entry[key] = more[key]; }
            }
            entry.t = Date.now();
            all[g] = entry;
            // Keep the twelve latest: a round is over after two days anyway.
            var ids = Object.keys(all).sort(function (a, b) { return (all[b].t || 0) - (all[a].t || 0); });
            ids.slice(12).forEach(function (id) { delete all[id]; });
            page.save(ROUNDS_KEY, all);
        }

        /** A round this browser played (picked in) on `day`, other than `g`. */
        function playedOther(day, g) {
            var all = rounds();
            for (var id in all) {
                if (Object.prototype.hasOwnProperty.call(all, id) && id !== g && all[id].day === day && all[id].picked) { return id; }
            }
            return null;
        }

        // ---------- the server ----------

        function act(body, done) {
            body.lang = s.lang;
            body.uid = page.uid();
            body.src = page.src();
            page.postJson(body, done);
        }

        function link(r) {
            return rc.roundUrl(location.origin, s, r.no, r.g, page.src());
        }

        // ---------- 1. the starter's card, on the puzzle's own reveal ----------

        /**
         * In the group half, in place of SEND TO YOUR GROUP and "Now fool your friends". One tap saves
         * the round and opens WhatsApp with message 1. The link is made here, so the tap opens the chat
         * at once; if the save fails, the card says so and the same tap again saves the same round.
         */
        function starterCard(puzzle, kind, pct) {
            var box = el('section', 'card round-start');
            box.appendChild(el('h2', '', s.roundTitle));
            box.appendChild(el('p', '', s.roundText));
            var kept = page.load(START_KEY);
            if (!kept || kept.day !== puzzle.day || !rc.cleanRoundId(kept.g)) { kept = null; }
            var lastName = page.lastName();
            var lie = page.field(box, 'd-lie', s.roundLie, core.LIE_MAX, kept ? kept.l || '' : '');
            var name = page.field(box, 'd-name', s.roundName, core.NAME_MAX, kept ? kept.n || lastName : lastName);
            var error = el('p', 'error');
            error.setAttribute('role', 'alert');
            show(error, false);
            box.appendChild(error);
            var after = el('p', 'see-board');
            show(after, false);
            var say = function (text) { error.textContent = text || ''; show(error, !!text); };

            var current = null;
            var message = function () {
                var typed = core.tidy(lie.value);
                var who = core.tidy(name.value);
                var why = typed ? core.screenLie(typed, who, page.truth(), page.houseLies(), page.shared.isSameAnswer, page.shared.nameFlag)
                    : (who && (page.shared.nameFlag(who) || core.carriesContact(who)) ? 'refused' : null);
                if (!why && typed && !who) { why = 'name'; }
                say(why === 'truth' ? s.lieIsTruth : why === 'taken' ? s.lieIsTaken : why === 'refused' ? s.lieRefused : why === 'name' ? s.nameNeeded : '');
                if (why) {
                    (why === 'name' ? name : lie).focus();
                    current = null;
                    return '';
                }
                // The same words sent twice keep one round; other words after a saved round start a new one.
                var g = kept && kept.l === typed && kept.n === who ? kept.g : core.newId(10);
                current = { g: g, n: who, l: typed };
                var url = rc.roundUrl(location.origin, s, puzzle.no, g, page.src());
                return rc.startText(s, puzzle, kind, pct, !!typed, url);
            };
            var save = function () {
                if (!current) { return; }
                var mine = current;
                page.save(START_KEY, { day: puzzle.day, g: mine.g, n: mine.n, l: mine.l, saved: false });
                if (mine.n) { page.rememberName(mine.n); }
                act({ a: 'start', no: puzzle.no, g: mine.g, n: mine.n, l: mine.l, k: kind === 'truth' || kind === 'house' ? kind : '', m: 'round-start' }, function (res) {
                    if (!res || res.error) {
                        say(res && res.error === 'name-taken' ? core.fill(s.nameTaken, { name: mine.n })
                            : res && (res.error === 'truth' || res.error === 'taken' || res.error === 'refused') ? s.lieRefused : s.startFailed);
                        return;
                    }
                    kept = { day: puzzle.day, g: mine.g, n: mine.n, l: mine.l, saved: true };
                    page.save(START_KEY, kept);
                    remember(mine.g, { day: puzzle.day, no: puzzle.no, picked: true, seen: started(!!mine.l) });
                    seeBoard(after, mine.g, puzzle.no);
                });
            };
            box.appendChild(page.sendButtons(message, s.roundSend, null, save));
            box.appendChild(after);
            if (kept && kept.saved) { seeBoard(after, kept.g, puzzle.no); }
            return box;
        }

        /** What the starter has seen of a round it just started: its own lie, if any, and nobody yet. */
        function started(hasLie) {
            return { fell: [], more: 0, lies: hasLie ? 1 : 0, mine: hasLie };
        }

        function seeBoard(line, g, no) {
            clear(line);
            var a = el('a', '', s.roundSeeBoard);
            a.href = rc.roundUrl('', s, no, g, page.src());
            line.appendChild(a);
            show(line, true);
        }

        // ---------- 2. a round link ----------

        /**
         * The page opened on a round link. `plain` goes on to today's question as the puzzle shows
         * it, with a note on top (a round that is gone, full or didn't load).
         */
        function open(r, plain) {
            if (!rc.validRound(r) || r.state === 'missing') {
                return plain(s.roundMissing);
            }
            if (r.state === 'gone') {
                return plain(s.over);
            }
            if (r.state === 'full') {
                return plain(s.roundFull);
            }
            view = r;
            setTop(r);
            if (r.me || r.state === 'over') {
                return reveal(false);
            }
            var state = page.state();
            var elsewhere = (state.day === r.day && state.pick !== null && state.pick !== 'r') || playedOther(r.day, r.g);
            if (elsewhere || !r.answers || r.answers.length < 2) {
                return lieOnly();
            }
            ask();
        }

        function setTop(r) {
            var candle = r.pack === 'hanukkah' ? r.candle : 0;
            $('d-kicker').textContent = core.kicker(s, r.no, candle);
            document.body.className = r.pack === 'hanukkah' ? 'hanukkah' : '';
            var q = clear($('d-q'));
            var parts = core.halves(r.q);
            q.appendChild(document.createTextNode(parts[0]));
            q.appendChild(el('span', 'blank', '____'));
            q.appendChild(document.createTextNode(parts[1]));
        }

        function ask() {
            page.note('');
            var how = $('d-how');
            how.textContent = rc.liarsLine(s, view.liars, view.lieCount);
            show(how, true);
            show($('d-reveal'), false);
            show($('d-foot'), true);
            var box = clear($('d-answers'));
            show(box, true);
            var error = el('p', 'error');
            show(error, false);
            var busy = false;
            view.answers.forEach(function (text, i) {
                var b = el('button', 'answer', text);
                b.type = 'button';
                b.onclick = function () {
                    if (busy) { return; }
                    busy = true;
                    show(error, false);
                    act({ a: 'pick', no: view.no, g: view.g, i: i }, function (res) {
                        busy = false;
                        if (!res || !res.round || !rc.validRound(res.round) || (res.error && !res.round.me)) {
                            error.textContent = s.saveFailed;
                            show(error, true);
                            return;
                        }
                        picked(res.round);
                    });
                };
                box.appendChild(b);
            });
            box.appendChild(error);
        }

        function picked(r) {
            view = r;
            remember(r.g, { day: r.day, no: r.no, picked: true, back: todayOf(r), seen: rc.snapshot(r.board) });
            page.playedInRound(r.day, r.no, r.g);
            reveal(true);
            try { $('d-reveal').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* older browsers */ }
        }

        function todayOf(r) {
            return page.today() || r.day;
        }

        /** Played today's question elsewhere: no pick, but a lie (and a name) may still go in. */
        function lieOnly() {
            page.note(s.playedElsewhere);
            show($('d-how'), false);
            show($('d-answers'), false);
            show($('d-foot'), false);
            var box = clear($('d-reveal'));
            show(box, true);
            box.appendChild(lieCard(true));
            box.appendChild(el('p', 'erased', s.erased));
        }

        // ---------- 3. the reveal and the board ----------

        function reveal(fresh) {
            var r = view;
            var me = r.me || {};
            var mem = rounds()[r.g] || {};
            var back = '';
            if (!fresh && r.me) {
                back = rc.backLine(s, r.board, mem.seen);
                var today = todayOf(r);
                if (mem.back !== today) {
                    page.post('round-back', { g: r.g, day: r.day });
                }
                remember(r.g, { day: r.day, no: r.no, back: today, seen: rc.snapshot(r.board), picked: mem.picked || me.kind === 'truth' || me.kind === 'house' || me.kind === 'friend' });
            }
            page.note(r.state === 'over' ? rc.overLine(s, r.board) : back);
            show($('d-how'), false);
            show($('d-answers'), false);
            show($('d-foot'), false);
            var box = clear($('d-reveal'));
            show(box, true);

            var kind = me.kind;
            if (kind === 'truth' || kind === 'house' || kind === 'friend') {
                var head = kind === 'truth' ? s.headTruth : kind === 'house' ? s.headLie
                    : (me.by ? core.fill(s.headFriendNamed, { name: me.by }) : s.headFriendUnnamed);
                box.appendChild(el('h2', 'head ' + (kind === 'truth' ? 'won' : 'lost'), head));
            }
            var sub = el('p', 'sub', core.fill(s.truthLine, { answer: r.board.truth.text }));
            var cite = core.safeCite(r.cite);
            if (cite) {
                var source = el('a', 'source', s.source);
                source.href = cite;
                source.target = '_blank';
                source.rel = 'noopener nofollow';
                sub.appendChild(document.createTextNode(' '));
                sub.appendChild(source);
            }
            box.appendChild(sub);
            box.appendChild(boardSection(r));

            if (r.state === 'open') {
                // A fresh player gets the lie card; a return visit, or a player whose lie is in, the score.
                if (r.me && !me.lie && !me.lieHidden) {
                    box.appendChild(lieCard(false));
                }
                if (r.me && (!fresh || me.lie || me.lieHidden)) {
                    box.appendChild(scoreButtons(r));
                }
                if (r.me) { box.appendChild(otherGroup(r)); }
            } else {
                var go = el('a', 'btn primary play-today', s.playToday);
                go.href = s.path + (page.src() && rc.isTestTag(page.src()) ? '?via=' + page.src() : '');
                box.appendChild(el('div', 'send')).appendChild(go);
            }
            if (r.board.played >= 3) { box.appendChild(liveCard(r)); }
            box.appendChild(el('p', 'erased', s.erased));
        }

        function inRound() {
            return { g: view.g, day: view.day };
        }

        function scoreButtons(r) {
            var wrap = page.sendButtons(function () { return rc.scoreText(s, r.no, r.board, link(r)); }, s.scoreSend, 'round-score', null, inRound);
            wrap.className += ' score';
            return wrap;
        }

        function rowNames(row) {
            return rc.names(s, row.names, row.more);
        }

        function boardSection(r) {
            var b = r.board;
            var box = el('section', 'board');
            box.appendChild(el('h3', 'board-title', core.fill(s.boardTitle, { n: b.played })));
            var list = el('div', 'rows');
            b.lies.forEach(function (l) {
                var row = el('div', 'row lie' + (l.mine ? ' mine' : ''));
                var top = el('p', 'who');
                top.appendChild(el('b', '', l.name));
                top.appendChild(document.createTextNode(' · "'));
                top.appendChild(el('span', 'text', l.lie));
                top.appendChild(document.createTextNode('"'));
                row.appendChild(top);
                row.appendChild(el('p', 'fell', core.fill(s.boardFell, { names: rowNames(l) })));
                if (r.state === 'open' && r.me) {
                    row.appendChild(lieAction(r, l));
                }
                list.appendChild(row);
            });
            var truth = el('div', 'row truth');
            var t = el('p', 'who');
            t.appendChild(el('b', '', s.boardTruth));
            t.appendChild(document.createTextNode(' · "'));
            t.appendChild(el('span', 'text', b.truth.text));
            t.appendChild(document.createTextNode('"'));
            truth.appendChild(t);
            truth.appendChild(el('p', 'fell', core.fill(s.boardFound, { names: rowNames(b.truth) })));
            list.appendChild(truth);
            if (b.house.names.length || b.house.more) {
                list.appendChild(el('div', 'row house')).appendChild(el('p', 'fell', core.fill(s.boardHouse, { names: rowNames(b.house) })));
            }
            box.appendChild(list);
            return box;
        }

        /** "Remove my lie" on one's own lie, "Not OK" on the others'. */
        function lieAction(r, l) {
            var wrap = el('p', 'lie-action');
            if (l.flagged) {
                wrap.appendChild(el('span', '', s.flagged));
                return wrap;
            }
            var b = el('button', 'link', l.mine ? s.remove : s.flag);
            b.type = 'button';
            b.onclick = function () {
                b.disabled = true;
                act(l.mine ? { a: 'remove', no: r.no, g: r.g } : { a: 'flag', no: r.no, g: r.g, id: l.id }, function (res) {
                    b.disabled = false;
                    if (res && res.round && rc.validRound(res.round) && res.round.board) {
                        view = res.round;
                        reveal(true);
                    }
                });
            };
            wrap.appendChild(b);
            return wrap;
        }

        // ---------- the player's card ----------

        /**
         * Name and lie, and TELL THE GROUP: one tap opens WhatsApp with message 2 and saves what was
         * typed. `only`: the browser played today's question elsewhere and picks nothing here.
         */
        function lieCard(only) {
            var r = view;
            var me = r.me || {};
            var box = el('section', 'card round-lie');
            box.appendChild(el('h2', '', s.lieCardTitle));
            box.appendChild(el('p', '', s.lieCardText));
            var name = page.field(box, 'd-name', s.roundName, core.NAME_MAX, me.name || page.lastName());
            var lie = page.field(box, 'd-lie', s.roundLie, core.LIE_MAX, '');
            var error = el('p', 'error');
            error.setAttribute('role', 'alert');
            show(error, false);
            box.appendChild(error);
            var say = function (text) { error.textContent = text || ''; show(error, !!text); };
            var typed = null;
            var others = function () { return (r.board ? r.board.lies : []).filter(function (l) { return !l.mine; }); };
            var message = function () {
                var l = core.tidy(lie.value);
                var n = core.tidy(name.value);
                var truth = r.board ? r.board.truth.text : (page.today() === r.day ? page.truth() : '');
                var taken = r.taken || (page.today() === r.day ? page.houseLies() : []);
                var why = l ? core.screenLie(l, n, truth, taken, page.shared.isSameAnswer, page.shared.nameFlag)
                    : (n && (page.shared.nameFlag(n) || core.carriesContact(n)) ? 'refused' : null);
                if (!why && l && !n) { why = 'name'; }
                if (!why && n && (r.names || []).some(function (x) { return x.toLowerCase() === n.toLowerCase(); })) { why = 'name-taken'; }
                say(why === 'truth' ? s.lieIsTruth : why === 'taken' ? s.lieIsTaken : why === 'refused' ? s.lieRefused
                    : why === 'name' ? s.nameNeeded : why === 'name-taken' ? core.fill(s.nameTaken, { name: n }) : '');
                if (why) {
                    (why === 'name' || why === 'name-taken' ? name : lie).focus();
                    typed = null;
                    return '';
                }
                typed = { n: n, l: l };
                var count = (r.board ? r.board.lies.length : r.lieCount || 0) + (l ? 1 : 0);
                return rc.tellText(s, only ? null : me, others(), !!l, count, link(r));
            };
            var save = function () {
                if (!typed || (!typed.l && (!typed.n || typed.n === me.name) && r.me)) { return; }
                var words = typed;
                if (words.n) { page.rememberName(words.n); }
                act({ a: 'lie', no: r.no, g: r.g, n: words.n, l: words.l }, function (res) {
                    if (!res || !res.round || !rc.validRound(res.round)) {
                        say(s.saveFailed);
                        return;
                    }
                    if (res.error) {
                        say(res.error === 'name-taken' ? core.fill(s.nameTaken, { name: words.n })
                            : res.error === 'name' ? s.nameNeeded : res.error === 'truth' ? s.lieIsTruth
                                : res.error === 'taken' ? s.lieIsTaken : res.error === 'full' ? s.roundFull : s.lieRefused);
                        return;
                    }
                    view = res.round;
                    remember(view.g, { day: view.day, no: view.no, back: todayOf(view), seen: rc.snapshot(view.board) });
                    reveal(true);
                });
            };
            box.appendChild(page.sendButtons(message, s.tellSend, 'round-tell-', save, inRound));
            return box;
        }

        // ---------- the two cards at the foot of the board ----------

        /** "In another group too?": a new round with this player's lie as its first, and message 1. */
        function otherGroup(r) {
            var me = r.me || {};
            var wrap = el('p', 'other-group');
            var a = el('a', '', s.otherGroup);
            a.href = '#';
            a.target = '_blank';
            a.rel = 'noopener';
            a.onclick = function () {
                var g = core.newId(10);
                var url = rc.roundUrl(location.origin, s, r.no, g, page.src());
                var text = rc.startText(s, { no: r.no, q: r.q }, me.kind, null, !!me.lie, url);
                a.href = 'https://wa.me/?text=' + encodeURIComponent(text);
                act({ a: 'start', no: r.no, g: g, n: me.name || '', l: me.lie || '', k: me.kind === 'truth' || me.kind === 'house' ? me.kind : '', m: 'round-other' }, function (res) {
                    if (res && res.ok) { remember(g, { day: r.day, no: r.no, picked: true, seen: started(!!me.lie) }); }
                });
            };
            wrap.appendChild(a);
            return wrap;
        }

        /** From three players on: the full game, tagged daily-round, or daily-round-<tag> on a post's round (a play-test keeps its test tag). */
        function liveCard(r) {
            var box = el('section', 'card game');
            box.appendChild(el('h2', '', rc.liveTitle(s, page.today() || r.day, r.board.played)));
            box.appendChild(el('p', '', s.liveText));
            var hanukkah = r.pack === 'hanukkah';
            var go = el('a', 'btn primary', hanukkah ? s.gameStartHanukkah : s.gameStart);
            go.href = core.createUrl(s, rc.roundCampaign(page.src()), hanukkah ? 'hanukkah' : '');
            go.onclick = function () { page.post('create', { g: r.g, day: r.day }); };
            box.appendChild(go);
            return box;
        }

        return { starterCard: starterCard, open: open };
    };
})();
