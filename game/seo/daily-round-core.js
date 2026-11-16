// The rules of a chat group's round (the daily puzzle's group mode) that need no page: who gets the
// group card, the round's link, the lines under the kicker and on the board, and the three messages
// people send to their chat. daily-page.js writes this file into the page after daily-core.js, and
// test/daily-round-core.test.js runs it in Node, so it is plain ES5 and touches neither the document
// nor the network. The server's side of the same round is functions/src/controllers/daily-round.ts.
(function (root) {
    'use strict';

    var ROUND_ID = /^[a-z0-9]{10}$/;
    var core = root.BSDailyCore || (typeof require === 'function' ? require('./daily-core') : null);
    var fill = core.fill;

    function cleanRoundId(g) {
        return typeof g === 'string' && ROUND_ID.test(g) ? g : null;
    }

    /** A play-test's tag (test, test-...): its rounds are test rounds and their links carry it. */
    function isTestTag(tag) {
        return tag === 'test' || /^test-/.test(tag || '');
    }

    /**
     * How the page names the way its visitor came (BigQuery shares.content_type), as the server's
     * DAILY_ARRIVALS in functions/src/controllers/daily.ts: these fixed tags keep their own name, any
     * other tag is a post's own (written daily-post).
     */
    var ARRIVALS = ['daily', 'daily-home', 'daily-seo', 'daily-game', 'daily-share', 'daily-fool', 'daily-round'];

    /** A post's own tag (?via=daily-round-wa-he-family): not empty, not a play-test's, not one of the puzzle's fixed arrivals. */
    function isPostTag(tag) {
        return !!core.cleanTag(tag) && !isTestTag(tag) && ARRIVALS.indexOf(tag) < 0;
    }

    /** The switch in the page's address: 'on', 'off', or '' when there is none. */
    function roundSwitch(search) {
        var m = /[?&]round=(on|off)(&|#|$)/.exec(search || '');
        return m ? m[1] : '';
    }

    /**
     * The 50/50 test: which half of browsers gets the group card in place of the puzzle's own send
     * buttons and lie card. By the page's random browser id, so a browser stays in its half: ids
     * starting a to r (18 of the 36 letters and digits) are the group half. In SQL:
     * REGEXP_CONTAINS(uid, r'^[a-r]'). No id (storage blocked): the puzzle as built.
     * The switch ?round=on or ?round=off in the address moves this one visit of this browser, with any
     * tag or none (the owner's own phone, before a post); see forcedHalf for how it is counted.
     */
    function groupHalf(uid, tag, search) {
        var sw = roundSwitch(search);
        if (sw) { return sw === 'on'; }
        return byId(uid);
    }

    function byId(uid) {
        return typeof uid === 'string' && /^[a-r][a-z0-9]{15}$/.test(uid);
    }

    /**
     * Whether the switch put this browser in the other half than its id would (?round=on in the
     * puzzle half, or ?round=off in the group half). Such a browser sends one round-forced row a day,
     * so the test's comparison can leave its id out. A play-test sends none: it is not counted anyway.
     */
    function forcedHalf(uid, tag, search) {
        var sw = roundSwitch(search);
        return !!sw && !isTestTag(tag) && (sw === 'on') !== byId(uid);
    }

    /**
     * The round's link: the puzzle's number (so the server finds its day) and the round's id, and
     * the starter's tag when it is a play-test's or a post's own, so a post's round keeps its tag
     * for everyone who opens it. The puzzle's fixed arrivals (daily-home and the like) stay off it:
     * a round link without a tag is written daily-round.
     */
    function roundUrl(origin, s, no, g, tag) {
        return origin + s.path + '?n=' + no + '&g=' + g + (isTestTag(tag) || isPostTag(tag) ? '&via=' + tag : '');
    }

    /**
     * The tag of a full game started from a round (opened_games.campaign): daily-round, a
     * play-test's own tag, or for a post's round daily-round-<the post's tag> (the tag itself when it
     * starts with daily-round- already), at most 40 letters as every tag. All start with daily-round
     * but the test's, so STARTS_WITH(campaign, 'daily-round') counts every game from a round.
     */
    function roundCampaign(tag) {
        if (isTestTag(tag)) { return tag; }
        if (!isPostTag(tag)) { return 'daily-round'; }
        var t = tag.indexOf('daily-round-') === 0 ? tag : 'daily-round-' + tag;
        return t.slice(0, 40).replace(/-+$/, '');
    }

    /** "Yossi, Noa and Dad", "Yossi and 2 more", "2 more", or "nobody yet". */
    function names(s, list, more) {
        list = list || [];
        more = more || 0;
        if (!list.length && !more) {
            return s.nobody;
        }
        var text = list.length <= 1 ? (list[0] || '')
            : list.slice(0, -1).join(', ') + s.and + list[list.length - 1];
        if (more > 0) {
            text = text ? text + fill(s.andMore, { n: more }) : fill(s.moreAlone, { n: more });
        }
        return text;
    }

    /** The line under the kicker: who hid lies in here. */
    function liarsLine(s, liars, count) {
        liars = liars || [];
        if (!count || !liars.length) {
            return s.liarsNone;
        }
        if (liars.length === 1 && count === 1) {
            return fill(s.liarsOne, { name: liars[0] });
        }
        if (count === 2 && liars.length >= 2) {
            return fill(s.liarsTwo, { a: liars[0], b: liars[1] });
        }
        if (count === 3 && liars.length >= 2) {
            return fill(s.liarsThree, { a: liars[0], b: liars[1] });
        }
        return fill(s.liarsMore, { a: liars[0], b: liars[1] || '', n: count - Math.min(2, liars.length) });
    }

    /** How many fell for a lie on the board. */
    function fooled(row) {
        return (row.names ? row.names.length : 0) + (row.more || 0);
    }

    /** The lie that fooled the most so far (the earlier one on a tie), or null when none fooled anyone. */
    function leader(board) {
        var best = null;
        (board && board.lies || []).forEach(function (l) {
            if (fooled(l) > 0 && (!best || fooled(l) > fooled(best))) { best = l; }
        });
        return best;
    }

    function mineOf(board) {
        var lies = board && board.lies || [];
        for (var i = 0; i < lies.length; i++) {
            if (lies[i].mine) { return lies[i]; }
        }
        return null;
    }

    /**
     * Message 1, the starter's: with a lie, "I hid a lie in today's question. Who falls for it?";
     * with none, the puzzle's own result line. Then the question, the ask, and the link.
     * kind: 'truth' or anything else (fell for a lie). pct: the puzzle's percentage, or null.
     */
    function startText(s, puzzle, kind, pct, hasLie, url) {
        var first;
        if (hasLie) {
            first = fill(s.startLie, { noTag: core.noTag(puzzle.no) });
        } else {
            var head = kind === 'truth' ? s.shareTruth : s.shareLie;
            var tail = kind === 'truth' ? s.shareTruthPct : s.shareLiePct;
            first = fill(head, { noTag: core.noTag(puzzle.no) }) + (pct === null || pct === undefined ? '' : fill(tail, { p: pct }));
        }
        return [first, '"' + core.sentence(puzzle.q) + '"', hasLie ? s.startAskLie : s.startAskNoLie, url].join('\n');
    }

    /**
     * Message 2, a player's: the reveal, in the chat. It names who fooled the sender and never an
     * answer. me: { kind, by } as the server says; others: the group's lies the sender could have
     * met (all shown lies but their own); lies: how many lies are in the round once theirs is in.
     */
    function tellText(s, me, others, addedLie, lies, url) {
        var parts = [];
        var kind = me && me.kind;
        if (kind === 'friend') {
            parts.push(fill(s.tellFriend, { name: me.by || '' }));
        } else if (kind === 'truth') {
            if (others.length === 1) {
                parts.push(fill(s.tellTruthOne, { name: others[0].name }));
            } else if (others.length > 1) {
                parts.push(fill(s.tellTruthMany, { n: others.length }));
            } else {
                parts.push(s.tellTruth);
            }
        } else if (kind === 'house') {
            parts.push(s.tellHouse);
        }
        if (addedLie) {
            // The round's first lie has words of its own: "1 lies" is no sentence.
            parts.push(lies === 1 ? s.tellAddedOne : fill(s.tellAdded, { n: lies }));
        }
        parts.push(fill(s.tellTurn, { link: url }));
        return parts.join(' ');
    }

    /** Message 3, the score so far: the leading lie, the sender's own, and who hasn't played. */
    function scoreText(s, no, board, url) {
        var lead = leader(board);
        var own = mineOf(board);
        var y = board.picked;
        var text = fill(s.scoreHead, { noTag: core.noTag(no) });
        if (!lead) {
            text += s.scoreNone;
        } else if (lead.mine) {
            text += fill(s.scoreMineLead, { x: fooled(lead), y: y });
        } else {
            text += fill(s.scoreLead, { name: lead.name, x: fooled(lead), y: y });
            if (own) { text += fill(s.scoreMine, { x: fooled(own) }); }
        }
        return text + s.scoreAsk + ' ' + url;
    }

    /** "This round is over." and, when a lie fooled anyone, whose won. */
    function overLine(s, board) {
        var lead = leader(board);
        return lead ? s.over + fill(s.overWon, { name: lead.name, x: fooled(lead), y: board.picked }) : s.over;
    }

    /** What this browser remembers of the board, to say what is new on its next visit. */
    function snapshot(board) {
        var own = mineOf(board);
        return { fell: own ? own.names.slice() : [], more: own ? own.more || 0 : 0, lies: (board.lies || []).length, mine: !!own };
    }

    /** "Since you played: your lie got Noa and Dad. 2 new lies." or "Nothing new since you played..." */
    function backLine(s, board, before) {
        if (!before) {
            return '';
        }
        var now = snapshot(board);
        var parts = [];
        if (now.mine) {
            var newNames = now.fell.filter(function (n) { return before.fell.indexOf(n) < 0; });
            var newMore = Math.max(0, now.more - (before.more || 0));
            if (newNames.length || newMore) {
                parts.push(fill(s.backFell, { who: names(s, newNames, newMore) }));
            }
        }
        var newLies = now.lies - (before.lies || 0) - (now.mine && !before.mine ? 1 : 0);
        if (newLies === 1) {
            parts.push(s.backLie);
        } else if (newLies > 1) {
            parts.push(fill(s.backLies, { n: newLies }));
        }
        return parts.length ? s.backHead + ' ' + parts.join(' ') : s.backNone;
    }

    /** The live game card's title: weekdays (Sunday to Wednesday) or the weekend, by the day in Israel. */
    function liveTitle(s, day, played) {
        var d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay();
        return fill(d >= 4 ? s.liveWeekend : s.liveWeek, { n: played });
    }

    /** The answer the server sends for a round is one we can show. */
    function validRound(r) {
        return !!r && typeof r === 'object' && !!cleanRoundId(r.g)
            && ['open', 'over', 'full', 'gone', 'missing'].indexOf(r.state) >= 0
            && (r.state === 'gone' || r.state === 'missing' || (typeof r.q === 'string' && typeof r.no === 'number' && typeof r.day === 'string'));
    }

    var api = {
        cleanRoundId: cleanRoundId, isTestTag: isTestTag, isPostTag: isPostTag, groupHalf: groupHalf, forcedHalf: forcedHalf,
        roundCampaign: roundCampaign, roundUrl: roundUrl, names: names,
        liarsLine: liarsLine, fooled: fooled, leader: leader, mineOf: mineOf, startText: startText, tellText: tellText,
        scoreText: scoreText, overLine: overLine, snapshot: snapshot, backLine: backLine, liveTitle: liveTitle,
        validRound: validRound,
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.BSDailyRoundCore = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
